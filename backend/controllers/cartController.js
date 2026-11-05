const User = require('../models/userModel');
const Product = require('../models/productModel');
const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const ErrorHandler = require('../utils/errorHandler');

/**
 * The cart lives on the user document (`User.cart`), so it is the same cart
 * whether the customer is on the website or the mobile app. Both clients talk
 * to these endpoints; neither keeps its own authoritative copy.
 *
 * A "line" is product + variant (colour/size), so the same tile in two
 * colours is two lines rather than one with a muddled quantity.
 */

const sameLine = (item, productId, variant) =>
    String(item.product?._id || item.product) === String(productId) &&
    (item.variant?.color || '') === (variant?.color || '') &&
    (item.variant?.size || '') === (variant?.size || '');

/**
 * One shape both clients read. `id`/`productId` are strings (Mongo ids), and
 * `product` carries just enough to render a cart row without a second fetch.
 */
function shape(item) {
    const p = item.product && item.product._id ? item.product : null;
    return {
        id: String(item._id),
        productId: String(p ? p._id : item.product),
        name: p ? p.name : item.name,
        price: p ? p.price : item.price,
        cuttedPrice: p ? p.cuttedPrice : undefined,
        stock: p ? p.stock : undefined,
        quantity: item.quantity,
        image: p ? (p.images?.find((i) => i.isFeatured) || p.images?.[0])?.url || item.image : item.image,
        images: p ? p.images : undefined,
        variant: { color: item.variant?.color, size: item.variant?.size },
        // Flattened for the web cart, which reads `item.size` directly.
        size: item.variant?.size || 'default',
        addedAt: item.addedAt,
    };
}

const CART_PRODUCT_FIELDS = 'name price cuttedPrice stock images listingStatus category';

async function respond(userId, res, statusCode = 200) {
    const user = await User.findById(userId).populate({
        path: 'cart.product',
        select: CART_PRODUCT_FIELDS,
    });

    // A product deleted or pulled from sale shouldn't wedge the cart — drop
    // those lines instead of rendering a row with no product behind it.
    const live = user.cart.filter((i) => i.product);
    if (live.length !== user.cart.length) {
        user.cart = live;
        await user.save({ validateBeforeSave: false });
    }

    res.status(statusCode).json({
        success: true,
        cart: live.map(shape),
        count: live.reduce((n, i) => n + i.quantity, 0),
    });
}

/** Caps a requested quantity at what's actually in stock. */
function capped(quantity, stock) {
    const max = Number(stock) > 0 ? Number(stock) : 0;
    return Math.max(0, Math.min(Number(quantity) || 1, max));
}

// Get Cart
exports.getCart = asyncErrorHandler(async (req, res) => {
    await respond(req.user.id, res);
});

// Add To Cart (or increment an existing line)
exports.addToCart = asyncErrorHandler(async (req, res, next) => {
    // `product` is the name the order endpoint uses; `productId` is what the
    // web cart hooks send. Accept either.
    const productId = req.body.product || req.body.productId;
    const { quantity = 1, variant = null } = req.body;

    if (!productId) {
        return next(new ErrorHandler("Product id is required", 400));
    }

    const product = await Product.findById(productId).select(CART_PRODUCT_FIELDS);
    if (!product || product.listingStatus !== 'live') {
        return next(new ErrorHandler("Product Not Found", 404));
    }
    if (!(Number(product.stock) > 0)) {
        return next(new ErrorHandler("This product is out of stock", 400));
    }

    const user = await User.findById(req.user.id);
    const existing = user.cart.find((i) => sameLine(i, productId, variant));

    if (existing) {
        existing.quantity = capped(existing.quantity + Number(quantity || 1), product.stock);
    } else {
        user.cart.push({
            product: product._id,
            name: product.name,
            price: product.price,
            quantity: capped(quantity, product.stock) || 1,
            image: (product.images?.find((i) => i.isFeatured) || product.images?.[0])?.url,
            variant: { color: variant?.color, size: variant?.size },
        });
    }

    await user.save({ validateBeforeSave: false });
    await respond(req.user.id, res, 201);
});

// Update Cart Item Quantity
exports.updateCartItem = asyncErrorHandler(async (req, res, next) => {
    const quantity = Number(req.body.quantity);

    const user = await User.findById(req.user.id);
    const item = user.cart.id(req.params.itemId);
    if (!item) {
        return next(new ErrorHandler("Cart item Not Found", 404));
    }

    // Quantity 0 (or below) means remove — the web decrements to zero rather
    // than calling delete.
    if (!(quantity > 0)) {
        user.cart.pull(req.params.itemId);
    } else {
        const product = await Product.findById(item.product).select('stock');
        item.quantity = capped(quantity, product?.stock) || 1;
    }

    await user.save({ validateBeforeSave: false });
    await respond(req.user.id, res);
});

// Remove Cart Item
exports.removeCartItem = asyncErrorHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id);
    if (!user.cart.id(req.params.itemId)) {
        return next(new ErrorHandler("Cart item Not Found", 404));
    }

    user.cart.pull(req.params.itemId);
    await user.save({ validateBeforeSave: false });
    await respond(req.user.id, res);
});

// Clear Cart
exports.clearCart = asyncErrorHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    user.cart = [];
    await user.save({ validateBeforeSave: false });
    await respond(req.user.id, res);
});

/**
 * Merge a guest cart into the signed-in cart.
 *
 * Called right after login/register by any client that let someone fill a
 * basket before authenticating. Quantities add up per line; unknown or
 * out-of-stock products are skipped rather than failing the whole merge.
 */
exports.mergeCart = asyncErrorHandler(async (req, res, next) => {
    const incoming = Array.isArray(req.body.items) ? req.body.items : [];
    if (!incoming.length) {
        return respond(req.user.id, res);
    }

    const ids = incoming.map((i) => i.product || i.productId).filter(Boolean);
    const products = await Product.find({
        _id: { $in: ids },
        listingStatus: 'live',
    }).select(CART_PRODUCT_FIELDS);
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const user = await User.findById(req.user.id);

    for (const line of incoming) {
        const product = byId.get(String(line.product || line.productId));
        if (!product || !(Number(product.stock) > 0)) continue;

        const variant = line.variant || null;
        const existing = user.cart.find((i) => sameLine(i, product._id, variant));

        if (existing) {
            existing.quantity = capped(existing.quantity + Number(line.quantity || 1), product.stock);
        } else {
            user.cart.push({
                product: product._id,
                name: product.name,
                price: product.price,
                quantity: capped(line.quantity, product.stock) || 1,
                image: (product.images?.find((i) => i.isFeatured) || product.images?.[0])?.url,
                variant: { color: variant?.color, size: variant?.size },
            });
        }
    }

    await user.save({ validateBeforeSave: false });
    await respond(req.user.id, res);
});
