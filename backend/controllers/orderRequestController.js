const cloudinary = require('cloudinary');
const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const ErrorHandler = require('../utils/errorHandler');
const Order = require('../models/orderModel');
const OrderRequest = require('../models/orderRequestModel');
const {
    allowedType,
    closedReason,
    returnableItems,
    requestError,
    resolveMode,
    approvalOutcome,
    MAX_IMAGES,
} = require('../utils/orderRequest');
const {
    applyCancellation,
    applyReturn,
    applyReplacement,
} = require('./orderController');

/**
 * Customers ask; admin decides — Phase 22.
 *
 * The customer could not previously cancel or return anything themselves; both
 * were admin-only status changes. This adds the asking and the deciding, and
 * nothing else: approving dispatches straight into the Phase 21 flows that
 * already move the money, via the three functions orderController exports.
 *
 * Every rule about WHAT may be asked for lives in utils/orderRequest.js, so
 * this file is the plumbing and that file is the policy.
 */

/** The order, plus the request context the customer UI needs to render buttons. */
exports.getRequestOptions = asyncErrorHandler(async (req, res, next) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });

    if (!order) {
        return next(new ErrorHandler("Order Not Found", 404));
    }

    // Both are needed: a pending one blocks a new request, and a rejected one
    // closes the order permanently (the user's rule — no re-requesting).
    const existing = await OrderRequest.findOne({ order: order._id })
        .sort({ createdAt: -1 });

    const type = allowedType(order);

    res.status(200).json({
        success: true,
        // 'cancel' | 'return' | null — which button, if any, to show.
        allowedType: type,
        closedReason: closedReason(order),
        // Per line: eligible, which modes, and why not when it is not. Returned
        // whole so the form can grey out an ineligible item WITH its reason
        // rather than silently omitting it.
        items: type === 'return' ? returnableItems(order) : [],
        request: existing,
        // The two reasons a new request is refused outright, so the UI can say
        // so instead of offering a button that will fail.
        canRequest: Boolean(type) && !existing,
        maxImages: MAX_IMAGES,
    });
});

/**
 * Create a request ---CUSTOMER
 *
 * Images arrive as base64 data URIs (or an array of them) exactly as the
 * product forms already send them, and go to Cloudinary the same way.
 */
exports.createRequest = asyncErrorHandler(async (req, res, next) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });

    if (!order) {
        return next(new ErrorHandler("Order Not Found", 404));
    }

    const { type, mode, items, reason } = req.body;

    const existing = await OrderRequest.find({ order: order._id }).sort({ createdAt: -1 });
    const openRequest = existing.find((r) => r.status === 'pending') || null;
    const rejectedRequestExists = existing.some((r) => r.status === 'rejected');

    const incomingImages = normaliseImages(req.body.images);

    // Validated BEFORE anything is uploaded, so a refused request does not
    // leave orphaned files in Cloudinary.
    const error = requestError({
        order: { ...order.toObject(), rejectedRequestExists },
        type,
        mode,
        items,
        reason,
        images: incomingImages,
        openRequest,
    });

    if (error) {
        return next(new ErrorHandler(error, 400));
    }

    const uploaded = [];
    if (type === 'return' && incomingImages.length > 0) {
        for (const image of incomingImages) {
            try {
                const result = await cloudinary.v2.uploader.upload(image, {
                    folder: 'order-requests',
                    width: 1280,
                    crop: 'limit',
                });
                uploaded.push({ public_id: result.public_id, url: result.secure_url });
            } catch (err) {
                // One bad photo must not lose the whole request — the text is
                // the part that matters, and the customer can be asked again.
                console.error('Order request image upload failed:', err.message);
            }
        }
    }

    // The lines being returned, named here so the request still reads correctly
    // if the product is renamed later.
    const requestedItems = type === 'return'
        ? order.orderItems
            .filter((item) => items.map(String).includes(String(item.product)))
            .map((item) => ({ product: item.product, name: item.name, quantity: item.quantity }))
        : [];

    const request = await OrderRequest.create({
        order: order._id,
        user: req.user._id,
        type,
        // Filled in server-side when the policy leaves one option, which is
        // what "no choice because there is only one" means in storage too.
        mode: resolveMode({ order, type, mode, items }),
        items: requestedItems,
        reason: String(reason).trim(),
        images: uploaded,
    });

    res.status(201).json({
        success: true,
        message: type === 'cancel'
            ? 'Your cancellation request has been sent for review'
            : 'Your return request has been sent for review',
        request,
    });
});

/** This customer's own requests, newest first. */
exports.myRequests = asyncErrorHandler(async (req, res) => {
    const requests = await OrderRequest.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(100);

    res.status(200).json({ success: true, requests });
});

/**
 * The admin queue ---ADMIN
 *
 * Backs the "Request pending" chip on /admin/orders. Without a list, a request
 * living only inside one order's detail page is a request nobody finds.
 */
exports.getAllRequests = asyncErrorHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const requests = await OrderRequest.find(filter)
        .sort({ status: 1, createdAt: -1 })
        .limit(200)
        .populate('user', 'name email')
        .populate('order', 'orderStatus totalPrice createdAt');

    const pendingCount = await OrderRequest.countDocuments({ status: 'pending' });

    res.status(200).json({
        success: true,
        requests,
        pendingCount,
        // Just the order ids, so the orders table can mark its rows without
        // loading every request body.
        pendingOrderIds: (await OrderRequest.find({ status: 'pending' }).select('order'))
            .map((r) => String(r.order)),
    });
});

/** One order's request ---ADMIN */
exports.getRequestForOrder = asyncErrorHandler(async (req, res) => {
    const request = await OrderRequest.findOne({ order: req.params.id })
        .sort({ createdAt: -1 })
        .populate('user', 'name email')
        .populate('decidedBy', 'name');

    res.status(200).json({ success: true, request: request || null });
});

/**
 * Approve or reject ---ADMIN
 *
 * Approving does nothing new: it dispatches into the Phase 21 flow the request
 * maps to, with the customer's chosen items. Rejecting records the note the
 * customer is shown and leaves the order untouched.
 */
exports.decideRequest = asyncErrorHandler(async (req, res, next) => {
    const { status, adminNote } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
        return next(new ErrorHandler("Decision must be 'approved' or 'rejected'", 400));
    }

    const request = await OrderRequest.findById(req.params.id);

    if (!request) {
        return next(new ErrorHandler("Request not found", 404));
    }

    if (request.status !== 'pending') {
        return next(new ErrorHandler(`This request was already ${request.status}`, 400));
    }

    // Rejecting without a reason is the worst version of this feature: the
    // customer is shown this note, and "declined" on its own tells them nothing.
    if (status === 'rejected' && !String(adminNote || '').trim()) {
        return next(new ErrorHandler("Please give a reason — the customer is shown it", 400));
    }

    const order = await Order.findById(request.order);
    if (!order) {
        return next(new ErrorHandler("The order behind this request no longer exists", 404));
    }

    if (status === 'rejected') {
        request.status = 'rejected';
        request.adminNote = String(adminNote).trim();
        request.decidedBy = req.user._id;
        request.decidedAt = new Date();
        await request.save();

        order.statusHistory.push({
            status: order.orderStatus,
            timestamp: Date.now(),
            updatedBy: req.user._id,
            note: `${request.type === 'cancel' ? 'Cancellation' : 'Return'} request declined — ${request.adminNote}`,
        });
        await order.save({ validateBeforeSave: false });

        return res.status(200).json({
            success: true,
            message: 'Request declined. The customer can see your reason.',
            request,
            order,
        });
    }

    // ── approved ──
    const outcome = approvalOutcome(request);
    const productIds = request.items.map((i) => String(i.product));
    const note = `Approved ${request.type} request — ${request.reason}`;

    let refund = null;
    let reversalFailures = [];

    if (outcome === 'Cancelled') {
        reversalFailures = await applyCancellation(order, { note: 'cancellation request approved' });
        order.cancelledAt = Date.now();
        order.cancellationReason = request.reason;
    } else if (outcome === 'Returned') {
        const result = await applyReturn(order, {
            note: request.reason,
            decidedBy: req.user._id,
            productIds,
        });
        if (result.error) return next(new ErrorHandler(result.error, 400));
        refund = result.refund;
    } else {
        const result = await applyReplacement(order, { productIds });
        if (result.error) return next(new ErrorHandler(result.error, 400));
    }

    order.orderStatus = outcome;
    order.statusHistory.push({
        status: outcome,
        timestamp: Date.now(),
        updatedBy: req.user._id,
        note,
    });
    await order.save({ validateBeforeSave: false });

    request.status = 'approved';
    request.adminNote = String(adminNote || '').trim() || null;
    request.decidedBy = req.user._id;
    request.decidedAt = new Date();
    await request.save();

    res.status(200).json({
        success: true,
        message: outcome === 'Cancelled'
            ? 'Cancellation approved and the order has been cancelled'
            : outcome === 'Returned'
                ? `Return approved${refund?.amount ? ` — ₹${refund.amount.toFixed(2)} refunded` : ''}`
                : 'Replacement approved',
        request,
        order,
        ...(refund ? { refund } : {}),
        ...(reversalFailures.length > 0 ? { reversalFailures } : {}),
    });
});

/**
 * Accepts one data URI or an array of them, which is how the existing product
 * forms post images. Anything else is dropped rather than handed to Cloudinary,
 * where a non-string argument throws a confusing path error.
 */
function normaliseImages(images) {
    if (!images) return [];
    const list = Array.isArray(images) ? images : [images];
    return list.filter((i) => typeof i === 'string' && i.trim().length > 0);
}
