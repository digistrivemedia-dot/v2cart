const User = require('../models/userModel');
const Product = require('../models/productModel');
const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const ErrorHandler = require('../utils/errorHandler');

/**
 * The wishlist lives on the user document (`User.wishlist`), the same way the
 * cart does — so it is one wishlist whether the customer is on the website or
 * in the app.
 *
 * Unlike the cart there is no quantity and no variant: a product is either
 * saved or it isn't, so adding twice is idempotent rather than additive.
 */

const WISHLIST_PRODUCT_FIELDS = 'name price cuttedPrice stock images listingStatus category ratings numOfReviews';

function shape(item) {
    const p = item.product;
    return {
        id: String(item._id),
        productId: String(p._id),
        name: p.name,
        price: p.price,
        cuttedPrice: p.cuttedPrice,
        stock: p.stock,
        image: (p.images?.find((i) => i.isFeatured) || p.images?.[0])?.url,
        images: p.images,
        category: p.category,
        ratings: p.ratings,
        numOfReviews: p.numOfReviews,
        addedAt: item.addedAt,
    };
}

async function respond(userId, res, statusCode = 200) {
    const user = await User.findById(userId).populate({
        path: 'wishlist.product',
        select: WISHLIST_PRODUCT_FIELDS,
    });

    // A product that was deleted or pulled from sale shouldn't leave a row
    // with nothing behind it.
    const live = user.wishlist.filter((i) => i.product);
    if (live.length !== user.wishlist.length) {
        user.wishlist = live;
        await user.save({ validateBeforeSave: false });
    }

    res.status(statusCode).json({
        success: true,
        wishlist: live.map(shape),
        // The ids alone, so a client can render "is this saved?" on a grid of
        // cards without walking the full list per card.
        productIds: live.map((i) => String(i.product._id)),
        count: live.length,
    });
}

// Get Wishlist
exports.getWishlist = asyncErrorHandler(async (req, res) => {
    await respond(req.user.id, res);
});

// Add To Wishlist
exports.addToWishlist = asyncErrorHandler(async (req, res, next) => {
    const productId = req.body.product || req.body.productId;

    if (!productId) {
        return next(new ErrorHandler("Product id is required", 400));
    }

    const product = await Product.findById(productId).select('listingStatus');
    if (!product || product.listingStatus !== 'live') {
        return next(new ErrorHandler("Product Not Found", 404));
    }

    const user = await User.findById(req.user.id);
    const already = user.wishlist.some((i) => String(i.product) === String(productId));

    // Saving something twice is the same as saving it once — a double tap
    // must not create a duplicate row.
    if (!already) {
        user.wishlist.push({ product: productId });
        await user.save({ validateBeforeSave: false });
    }

    await respond(req.user.id, res, already ? 200 : 201);
});

/**
 * Remove by product id, not by row id.
 *
 * The caller is a heart on a product card: it knows the product it's showing,
 * not which wishlist row holds it.
 */
exports.removeFromWishlist = asyncErrorHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id);
    const item = user.wishlist.find((i) => String(i.product) === String(req.params.productId));

    if (!item) {
        return next(new ErrorHandler("Product is not in your wishlist", 404));
    }

    user.wishlist.pull(item._id);
    await user.save({ validateBeforeSave: false });
    await respond(req.user.id, res);
});

// Clear Wishlist
exports.clearWishlist = asyncErrorHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    user.wishlist = [];
    await user.save({ validateBeforeSave: false });
    await respond(req.user.id, res);
});

/** Merge a guest wishlist in at login. Unknown products are skipped. */
exports.mergeWishlist = asyncErrorHandler(async (req, res) => {
    const incoming = Array.isArray(req.body.productIds) ? req.body.productIds : [];
    if (!incoming.length) {
        return respond(req.user.id, res);
    }

    const products = await Product.find({
        _id: { $in: incoming },
        listingStatus: 'live',
    }).select('_id');

    const user = await User.findById(req.user.id);

    for (const product of products) {
        const already = user.wishlist.some((i) => String(i.product) === String(product._id));
        if (!already) user.wishlist.push({ product: product._id });
    }

    await user.save({ validateBeforeSave: false });
    await respond(req.user.id, res);
});
