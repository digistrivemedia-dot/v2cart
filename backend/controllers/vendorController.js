const Product = require('../models/productModel');
const Order = require('../models/orderModel');
const Transaction = require('../models/transactionModel');
const asyncErrorHandler = require('../middlewares/asyncErrorHandler');

// Overview stats for the vendor dashboard.
exports.getVendorStats = asyncErrorHandler(async (req, res, next) => {
    const vendorId = req.user._id;

    const products = await Product.find({ user: vendorId });
    const productCount = products.length;
    const liveCount = products.filter(p => p.listingStatus === 'live').length;
    const pendingApprovalCount = products.filter(p => ['draft', 'pending_approval'].includes(p.listingStatus)).length;

    const rows = await Transaction.aggregate([
        { $match: { user: vendorId, type: { $in: ['vendor_earning', 'vendor_reversal'] } } },
        { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);

    let lifetimeIncome = 0;
    let earnedCount = 0;
    let reversedCount = 0;
    for (const row of rows) {
        lifetimeIncome += row.total;
        if (row._id === 'vendor_earning') earnedCount = row.count;
        if (row._id === 'vendor_reversal') reversedCount = row.count;
    }

    // Phase 21 — sold units whose money has not been released yet.
    //
    // Without this the vendor sees a sale on their orders page and no matching
    // income, with nothing on screen explaining the gap. `vendor_earning` is
    // only written at maturation now, so "sold" and "paid" are genuinely
    // different states and the dashboard has to name the one in between.
    const productIds = products.map((p) => p._id);
    const heldOrders = productIds.length
        ? await Order.find({
              orderStatus: { $nin: ['Cancelled', 'Returned'] },
              orderItems: {
                  $elemMatch: {
                      product: { $in: productIds },
                      settledAt: null,
                      returnedAt: null,
                  },
              },
          }).select('orderItems deliveredAt orderStatus')
        : [];

    const owned = new Set(productIds.map(String));
    let pendingIncome = 0;
    let pendingUnits = 0;
    let awaitingDelivery = 0;
    let nextReleaseAt = null;

    for (const order of heldOrders) {
        for (const item of order.orderItems) {
            if (!owned.has(String(item.product))) continue;
            if (item.settledAt || item.returnedAt) continue;

            const product = products.find((p) => String(p._id) === String(item.product));
            const unitNet = product?.vendorPrice ?? 0;

            pendingIncome += unitNet * item.quantity;
            pendingUnits += item.quantity;

            // No maturesAt means the order has not been delivered yet, so the
            // return clock has not even started. Counted separately because the
            // two read very differently to a vendor waiting on money.
            if (!item.maturesAt) {
                awaitingDelivery += item.quantity;
            } else if (!nextReleaseAt || new Date(item.maturesAt) < new Date(nextReleaseAt)) {
                nextReleaseAt = item.maturesAt;
            }
        }
    }

    res.status(200).json({
        success: true,
        stats: {
            productCount,
            liveCount,
            pendingApprovalCount,
            unitsSold: earnedCount - reversedCount,
            lifetimeIncome,
            // Sold, not yet paid: held against the customer's return window.
            pendingIncome: Number(pendingIncome.toFixed(2)),
            pendingUnits,
            awaitingDelivery,
            nextReleaseAt,
        }
    });
});

// Orders containing at least one of this vendor's products. Each order's
// items are filtered down to just this vendor's own line items, so a
// mixed-cart order never leaks another vendor's items.
exports.getVendorOrders = asyncErrorHandler(async (req, res, next) => {
    const vendorId = req.user._id;

    const vendorProducts = await Product.find({ user: vendorId }).select('_id');
    const productIds = vendorProducts.map(p => p._id);

    const orders = await Order.find({ 'orderItems.product': { $in: productIds } })
        .populate('user', 'name email')
        .sort({ createdAt: -1 });

    const vendorOrders = orders.map(order => ({
        _id: order._id,
        user: order.user,
        orderStatus: order.orderStatus,
        createdAt: order.createdAt,
        shippingInfo: order.shippingInfo,
        items: order.orderItems.filter(item =>
            productIds.some(id => id.equals(item.product))
        ),
    }));

    res.status(200).json({
        success: true,
        orders: vendorOrders,
    });
});

// This vendor's earning/reversal ledger rows.
exports.getVendorTransactions = asyncErrorHandler(async (req, res, next) => {
    const transactions = await Transaction.find({
        user: req.user._id,
        type: { $in: ['vendor_earning', 'vendor_reversal'] }
    })
        .populate('product', 'name images')
        .populate('order', 'orderStatus createdAt')
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        transactions,
    });
});
