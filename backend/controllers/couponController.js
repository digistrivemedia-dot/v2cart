const Coupon = require('../models/couponModel');
const Product = require('../models/productModel');
const PlatformSettings = require('../models/platformSettingsModel');
const { priceOrder, marginInCart } = require('../utils/orderTotals');
const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const ErrorHandler = require('../utils/errorHandler');

// Create Coupon - Admin only
exports.createCoupon = asyncErrorHandler(async (req, res, next) => {
    const {
        code,
        description,
        discountType,
        discountValue,
        minPurchaseAmount,
        maxDiscountAmount,
        usageLimit,
        perUserLimit,
        expiryDate,
        isActive
    } = req.body;

    // Validate required fields
    if (!code || !discountType || !discountValue || !expiryDate) {
        return next(new ErrorHandler("Please provide all required fields", 400));
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
        return next(new ErrorHandler("Coupon code already exists", 400));
    }

    // Validate discount value based on type
    if (discountType === 'percentage' && discountValue > 100) {
        return next(new ErrorHandler("Percentage discount cannot exceed 100%", 400));
    }

    // Create coupon
    const coupon = await Coupon.create({
        code: code.toUpperCase(),
        description,
        discountType,
        discountValue,
        minPurchaseAmount: minPurchaseAmount || 0,
        maxDiscountAmount: maxDiscountAmount || null,
        usageLimit: usageLimit || null,
        perUserLimit: perUserLimit || 1,
        expiryDate: new Date(expiryDate),
        isActive: isActive !== undefined ? isActive : true,
        createdBy: req.user.id
    });

    res.status(201).json({
        success: true,
        coupon,
        message: "Coupon created successfully"
    });
});

// Get All Coupons - Admin only
exports.getAllCoupons = asyncErrorHandler(async (req, res, next) => {
    const coupons = await Coupon.find()
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: coupons.length,
        coupons
    });
});

// Get Active Coupons - All users
exports.getActiveCoupons = asyncErrorHandler(async (req, res, next) => {
    const coupons = await Coupon.find({
        isActive: true,
        expiryDate: { $gt: new Date() }
    })
        .select('-usedBy -createdBy')
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: coupons.length,
        coupons
    });
});

// Get Single Coupon - Admin only
exports.getCoupon = asyncErrorHandler(async (req, res, next) => {
    const coupon = await Coupon.findById(req.params.id)
        .populate('createdBy', 'name email');

    if (!coupon) {
        return next(new ErrorHandler("Coupon not found", 404));
    }

    res.status(200).json({
        success: true,
        coupon
    });
});

// Validate Coupon - Customers only (not vendors/investors/admins)
/**
 * Quote a coupon against a real cart ---CUSTOMER
 *
 * ── Phase 23: this is now the SAME arithmetic the order uses ──────────────
 *
 * It used to take an `orderAmount` from the client and discount that. Two
 * things went wrong with it:
 *
 *   • the client sent the GST-and-shipping-inclusive total, so a percentage
 *     coupon was computed on a bigger number than the items are worth
 *   • nothing capped the discount at the margin, so the quote could promise
 *     more than checkout would accept — the customer paid the quoted amount
 *     and the order was then refused for underpaying
 *
 * So it prices the cart itself, from the database, through utils/orderTotals.js
 * — the same function `/order/new` verifies the payment against. The client
 * displays what comes back rather than computing a total of its own.
 *
 * `items` is `[{ product, quantity }]`. `orderAmount` is still accepted for
 * older clients (the mobile app), but only an `items` call can be capped
 * correctly, so that path returns `capped: false` to say so.
 */
exports.validateCoupon = asyncErrorHandler(async (req, res, next) => {
    const { code, orderAmount, items } = req.body;

    if (!code) {
        return next(new ErrorHandler("Please provide a coupon code", 400));
    }

    const coupon = await Coupon.findOne({ code: String(code).toUpperCase() });

    if (!coupon) {
        return next(new ErrorHandler("Invalid coupon code", 404));
    }

    const validityCheck = coupon.isValid();
    if (!validityCheck.valid) {
        return next(new ErrorHandler(validityCheck.message, 400));
    }

    const userCheck = coupon.canUserUse(req.user._id);
    if (!userCheck.canUse) {
        return next(new ErrorHandler(userCheck.message, 400));
    }

    const settings = await PlatformSettings.getSingleton();

    // ── the accurate path: price the real cart ──
    if (Array.isArray(items) && items.length > 0) {
        const lines = [];
        for (const item of items) {
            const product = await Product.findById(item.product);
            if (!product) {
                return next(new ErrorHandler("One of these products no longer exists", 404));
            }
            lines.push({
                product: product._id,
                quantity: Number(item.quantity) || 0,
                price: product.price,
                vendorPrice: product.vendorPrice,
            });
        }

        const itemsPrice = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

        if (itemsPrice < coupon.minPurchaseAmount) {
            return next(new ErrorHandler(
                `Minimum purchase amount of ₹${coupon.minPurchaseAmount} required`, 400
            ));
        }

        // Capped at the margin the cart contains — a discount is paid out of
        // the platform's cut and nothing else.
        const available = marginInCart(lines);
        const requested = coupon.calculateDiscount(itemsPrice);
        const discount = Math.min(requested, available);

        if (discount <= 0) {
            return next(new ErrorHandler("This coupon cannot be applied to these items", 400));
        }

        const quote = priceOrder({ lines, settings, discount });

        return res.status(200).json({
            success: true,
            coupon: {
                code: coupon.code,
                description: coupon.description,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                discount: quote.discountAmount,
                // Every figure the checkout should display, so it never has to
                // compute a total that could disagree with the one the order
                // endpoint verifies.
                itemsPrice: quote.itemsPrice,
                taxPrice: quote.taxPrice,
                shippingPrice: quote.shippingPrice,
                finalAmount: quote.total,
                // True when the coupon was worth more than the cart's margin.
                capped: discount < requested,
                capped_to: discount < requested ? available : null,
            },
        });
    }

    // ── the legacy path: a bare amount, uncapped ──
    if (!orderAmount) {
        return next(new ErrorHandler("Please provide the cart items", 400));
    }

    if (orderAmount < coupon.minPurchaseAmount) {
        return next(new ErrorHandler(
            `Minimum purchase amount of ₹${coupon.minPurchaseAmount} required`, 400
        ));
    }

    const discount = coupon.calculateDiscount(orderAmount);

    res.status(200).json({
        success: true,
        coupon: {
            code: coupon.code,
            description: coupon.description,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discount,
            finalAmount: orderAmount - discount,
            // The caller sent no cart, so the margin ceiling is unknown here.
            // Checkout applies it regardless, which may reduce this figure.
            capped: false,
        },
    });
});

exports.applyCoupon = asyncErrorHandler(async (req, res, next) => {
    const { code, orderAmount } = req.body;

    if (!code || !orderAmount) {
        return next(new ErrorHandler("Please provide coupon code and order amount", 400));
    }

    if (req.user.role !== 'user') {
        return next(new ErrorHandler("Coupons are only applicable for customer orders", 403));
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) {
        return next(new ErrorHandler("Invalid coupon code", 404));
    }

    // Check if coupon is valid
    const validityCheck = coupon.isValid();
    if (!validityCheck.valid) {
        return next(new ErrorHandler(validityCheck.message, 400));
    }

    // Check minimum purchase amount
    if (orderAmount < coupon.minPurchaseAmount) {
        return next(
            new ErrorHandler(
                `Minimum purchase amount of ₹${coupon.minPurchaseAmount} required`,
                400
            )
        );
    }

    // Check if user can use this coupon
    const userCheck = coupon.canUserUse(req.user.id);
    if (!userCheck.canUse) {
        return next(new ErrorHandler(userCheck.message, 400));
    }

    // NOTE: Usage count is NOT incremented here
    // It's tracked when the actual order is created in orderController.newOrder()

    // Calculate discount
    const discount = coupon.calculateDiscount(orderAmount);

    res.status(200).json({
        success: true,
        applied: true,
        coupon: {
            code: coupon.code,
            description: coupon.description,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discount,
            finalAmount: orderAmount - discount
        }
    });
});

// Update Coupon - Admin only
exports.updateCoupon = asyncErrorHandler(async (req, res, next) => {
    let coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
        return next(new ErrorHandler("Coupon not found", 404));
    }

    // Don't allow updating code if coupon has been used
    if (req.body.code && coupon.usageCount > 0) {
        return next(
            new ErrorHandler("Cannot update code for a coupon that has been used", 400)
        );
    }

    // Validate discount value if being updated
    if (req.body.discountType === 'percentage' && req.body.discountValue > 100) {
        return next(new ErrorHandler("Percentage discount cannot exceed 100%", 400));
    }

    coupon = await Coupon.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
            new: true,
            runValidators: true
        }
    );

    res.status(200).json({
        success: true,
        coupon,
        message: "Coupon updated successfully"
    });
});

// Delete Coupon - Admin only
exports.deleteCoupon = asyncErrorHandler(async (req, res, next) => {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
        return next(new ErrorHandler("Coupon not found", 404));
    }

    await coupon.deleteOne();

    res.status(200).json({
        success: true,
        message: "Coupon deleted successfully"
    });
});

// Toggle Coupon Active Status - Admin only
exports.toggleCouponStatus = asyncErrorHandler(async (req, res, next) => {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
        return next(new ErrorHandler("Coupon not found", 404));
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    res.status(200).json({
        success: true,
        coupon,
        message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`
    });
});
