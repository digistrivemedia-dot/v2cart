const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const Investment = require('../models/investmentModel');
const Transaction = require('../models/transactionModel');
const ErrorHandler = require('../utils/errorHandler');
const sendEmail = require('../utils/sendEmail');
const { reverseSale, reverseVendorSale } = require('../utils/wallet');
const PlatformSettings = require('../models/platformSettingsModel');
const { resolveReturnPolicy, canRefund, canReplace, returnWindowState } = require('../utils/returnPolicy');
const { stampMaturity, settleOrderItems, repoolItem } = require('../utils/settlement');
const { priceOrder, marginInCart } = require('../utils/orderTotals');

// type -> reversal type, for undoing a sale's settlement on cancellation.
// investor_investment is intentionally excluded: an investor's principal is
// never touched by an order cancellation, only re-pooled (see reverseSettlement).
const REVERSAL_TYPE = {
    vendor_earning: 'vendor_reversal',
    investor_payout: 'investor_reversal',
    platform_profit: 'platform_reversal',
};

// Marketplace matching — pairs each sold unit with the oldest unmatched
// investment for that product (FIFO) and snapshots the return policy the
// customer bought under. Runs once per newly created order.
//
// ── Phase 21: this no longer moves any money ──────────────────────────────
//
// It used to write the vendor/investor/platform ledger rows and credit the
// investor's wallet right here, at order placement — before the goods had even
// shipped. They are written at MATURATION now (utils/settlement.js), once the
// customer's return window has closed with nothing sent back, because until
// then the platform may still have to refund that money.
//
// What stays here is everything that is true the moment the sale happens: which
// investment funded which unit, and what rules that sale was made under.
async function settleOrder(order) {
    const settings = await PlatformSettings.getSingleton();

    for (const item of order.orderItems) {
        const product = await Product.findById(item.product);
        if (!product) continue;

        // Snapshotted onto the line, for the same reason an Investment
        // snapshots its margin bands: admin shortening this product's window
        // tomorrow must not shorten the right this customer has already bought.
        const { policy, windowDays } = resolveReturnPolicy(product, settings);
        item.returnPolicy = policy;
        item.returnWindowDays = windowDays;

        const matchedIds = [];

        for (let i = 0; i < item.quantity; i++) {
            // `matchedAt` is the clock the investor's band is measured on, and
            // it is stamped HERE rather than at maturation: their capital
            // stopped being at risk when the unit sold, and the return window
            // is a settlement delay rather than extra time at risk.
            const matchedInvestment = await Investment.findOneAndUpdate(
                { product: product._id, status: 'unmatched' },
                { status: 'matched', matchedOrder: order._id, matchedAt: Date.now() },
                { sort: { createdAt: 1 }, new: true }
            );

            if (matchedInvestment) matchedIds.push(matchedInvestment._id);
        }

        if (matchedIds.length > 0) {
            item.matchedInvestments = matchedIds;
        }
    }

    await order.save({ validateBeforeSave: false });
}

// Reverses ONE already-settled line: offsetting ledger rows, and the wallet
// credit taken back out of the investor's buckets.
//
// Since Phase 21 this is the uncommon path, and deliberately so. A line only
// reaches it if its money already matured — which means either a
// not-refundable product (settled at delivery) or a cancellation that arrived
// after the return window had closed. A line still inside its window has
// nothing credited, so it is re-pooled by repoolItem() instead and never comes
// through here.
//
// The hazard is unchanged and unavoidable on this path: if the investor has
// already withdrawn the profit, `reverseSale` throws InsufficientFunds. That is
// why the caller treats a failure here as "this line could not be reversed"
// and keeps going rather than aborting the whole cancellation.
async function reverseSettledItem(order, item, note) {
    const originalTxns = await Transaction.find({
        order: order._id,
        product: item.product,
        type: { $in: Object.keys(REVERSAL_TYPE) },
    });

    if (originalTxns.length > 0) {
        await Transaction.insertMany(originalTxns.map(txn => ({
            type: REVERSAL_TYPE[txn.type],
            user: txn.user,
            product: txn.product,
            order: txn.order,
            investment: txn.investment,
            amount: -txn.amount,
        })));
    }

    // Phase 23 — the vendor's wallet credit comes back too, since a settled
    // line has already paid them. Tolerant of failure on purpose: if the vendor
    // has withdrawn it there is nothing to recover, and that must not block the
    // rest of the reversal. The offsetting `vendor_reversal` ledger row above
    // records the debt either way.
    const settledProduct = await Product.findById(item.product).select('user vendorPrice');
    if (settledProduct?.user && settledProduct.vendorPrice > 0) {
        try {
            await reverseVendorSale(
                settledProduct.user,
                settledProduct.vendorPrice * item.quantity,
                { product: item.product, order: order._id, note }
            );
        } catch (err) {
            console.error(
                `Vendor wallet reversal failed on order ${order._id}:`, err.message
            );
        }
    }

    // Taken back BEFORE the investments are repriced by repoolItem: the
    // reversal has to undo the exact principal and payout that were credited,
    // and repricing rewrites both on the document.
    const matched = await Investment.find({ _id: { $in: item.matchedInvestments || [] } });
    for (const investment of matched) {
        await reverseSale(
            investment.investor,
            {
                principal: investment.amountInvested,
                // What was actually credited, which since Phase 20 is the band
                // figure rather than the forecast. Falls back to expectedPayout
                // for investments settled before that field existed.
                payout: investment.payoutPaid ?? investment.expectedPayout,
            },
            { investment: investment._id, product: item.product, order: order._id, note }
        );
    }

    item.settledAt = null;
}

// Undoes an order's settlement, line by line, and re-pools the investments so
// they are available for the next sale of that product.
//
// Returns the lines it could not reverse, so the caller can report them rather
// than failing the whole status change. Before Phase 21 one investor who had
// withdrawn their profit made the entire order uncancellable.
async function reverseSettlement(order, { note = 'order cancelled', markReturned = false } = {}) {
    const failed = [];

    for (const item of order.orderItems) {
        try {
            if (item.settledAt) {
                await reverseSettledItem(order, item, note);
            }
            await repoolItem(order, item, { reason: note, markReturned });
        } catch (err) {
            failed.push({ product: String(item.product), error: err.message });
        }
    }

    return failed;
}

/* ─────────────────────── the three outcomes, extracted ───────────────────
 *
 * Phase 22 made these callable from two places: an admin status change, and
 * the approval of a customer's request. They were inline in updateOrder, which
 * meant approving a request would have had to duplicate the money handling —
 * two copies of a refund is exactly the kind of thing that drifts.
 *
 * Each returns `{ error }` rather than throwing, so the caller decides whether
 * that is a 400 to an admin or a refusal to a customer.
 */

/**
 * Cancel: restore the stock and undo any settlement.
 *
 * Returns the lines whose already-matured money could not be clawed back (an
 * investor who has withdrawn it), so the caller can report them rather than
 * failing the whole cancellation.
 */
async function applyCancellation(order, { note = 'order cancelled' } = {}) {
    for (const item of order.orderItems) {
        await restoreStock(item.product, item.quantity);
    }
    return reverseSettlement(order, { note });
}

/**
 * Return: refund the customer, re-pool the investors' units, restock.
 *
 * Refused per line unless that line's SNAPSHOTTED policy allows a refund and
 * its window is still open — the policy the customer bought, so admin
 * tightening the product afterwards cannot retroactively take the right away.
 *
 * `productIds` narrows it to specific lines (a customer's request names the
 * items they are sending back). Omitted means every eligible line, which is the
 * admin-initiated whole-order return.
 */
async function applyReturn(order, { note, decidedBy = null, productIds = null } = {}) {
    const wanted = productIds ? new Set(productIds.map(String)) : null;
    const eligible = [];
    const refused = [];

    for (const item of order.orderItems) {
        if (item.returnedAt) continue;
        if (wanted && !wanted.has(String(item.product))) continue;

        const policy = {
            policy: item.returnPolicy || 'full',
            windowDays: item.returnWindowDays || 0,
        };

        if (!canRefund(policy.policy)) {
            refused.push(`${item.name}: ${policy.policy === 'none'
                ? 'not eligible for return'
                : 'eligible for replacement only, not a refund'}`);
            continue;
        }

        const state = returnWindowState(policy, order.deliveredAt);
        if (!state.open) {
            refused.push(`${item.name}: ${state.reason}`);
            continue;
        }

        eligible.push(item);
    }

    if (eligible.length === 0) {
        return { error: `Nothing on this order can be returned. ${refused.join('; ')}` };
    }

    // The refund is the customer's own money, which the platform is still
    // holding because nobody has been paid yet — that is the entire reason
    // settlement waits. The vendor could not fund this even if asked.
    const refund = await refundOrderItems(order, eligible, note);

    for (const item of eligible) {
        if (item.settledAt) {
            await reverseSettledItem(order, item, 'order returned');
        }
        await repoolItem(order, item, { reason: 'order returned', markReturned: true });
        await restoreStock(item.product, item.quantity);
    }

    order.returnedAt = Date.now();
    order.returnReason = note || null;

    if (refused.length > 0) {
        order.statusHistory.push({
            status: "Returned",
            timestamp: Date.now(),
            ...(decidedBy ? { updatedBy: decidedBy } : {}),
            note: `Not returned — ${refused.join('; ')}`,
        });
    }

    return { refund, refused, returnedItems: eligible.map((i) => String(i.product)) };
}

/**
 * Replacement: moves no money.
 *
 * The sale stands, the customer keeps a product they paid for, and the vendor
 * absorbs the cost of the second unit — so the vendor's earning and the
 * investor's payout are left exactly as they are, and the line still matures on
 * its original schedule.
 */
async function applyReplacement(order, { productIds = null } = {}) {
    const wanted = productIds ? new Set(productIds.map(String)) : null;

    const swappable = order.orderItems.filter((item) => {
        if (item.returnedAt) return false;
        if (wanted && !wanted.has(String(item.product))) return false;
        return canReplace(item.returnPolicy || 'full');
    });

    if (swappable.length === 0) {
        return { error: "Nothing on this order is eligible for replacement" };
    }

    for (const item of swappable) {
        item.replacedAt = Date.now();
        // The second unit leaves the vendor's stock. It does NOT pull another
        // investment off the FIFO queue: a warranty swap is the vendor's cost,
        // and matching it would pay a second investor for one customer payment.
        await updateStock(item.product, item.quantity);
    }

    return { replacedItems: swappable.map((i) => String(i.product)) };
}

exports.applyCancellation = applyCancellation;
exports.applyReturn = applyReturn;
exports.applyReplacement = applyReplacement;

// Create New Order
//
// ── Phase 23: the server decides what this costs ─────────────────────────
//
// This used to record `totalPrice` from the request body and accept
// `paymentInfo` on trust. Nothing recomputed the total and nothing asked the
// gateway whether that payment existed, so a crafted request created a
// Confirmed order for any amount — demonstrated against the dev database with
// a fabricated payment id and `totalPrice: 1`.
//
// Now: prices are looked up, the coupon is validated and capped, the total is
// computed by utils/orderTotals.js, and the payment is fetched from Razorpay
// and checked to cover it. The client's figure is only ever compared.
exports.newOrder = asyncErrorHandler(async (req, res, next) => {

    const { shippingInfo, orderItems, paymentInfo, couponCode } = req.body;

    if (!Array.isArray(orderItems) || orderItems.length === 0) {
        return next(new ErrorHandler("An order needs at least one item", 400));
    }

    if (!paymentInfo?.id) {
        return next(new ErrorHandler("Payment details are required", 400));
    }

    // One payment, one order. Checked on the id alone — the old check compared
    // the whole `paymentInfo` object, so the same payment with a different
    // `status` string slipped straight past it.
    const alreadyUsed = await Order.findOne({ 'paymentInfo.id': paymentInfo.id });
    if (alreadyUsed) {
        return next(new ErrorHandler("This payment has already been used for an order", 400));
    }

    const settings = await PlatformSettings.getSingleton();

    // ── Price the cart from the DATABASE ──
    //
    // Quantities are the only thing taken from the client; every price comes
    // from the product. Stock is checked here too, so an order can no longer
    // drive a product's stock negative.
    const lines = [];
    for (const item of orderItems) {
        const product = await Product.findById(item.product);

        if (!product) {
            return next(new ErrorHandler("One of these products no longer exists", 404));
        }
        if (product.listingStatus !== 'live') {
            return next(new ErrorHandler(`${product.name} is no longer available`, 400));
        }
        if (!(product.price > 0)) {
            return next(new ErrorHandler(`${product.name} is not priced for sale`, 400));
        }

        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) {
            return next(new ErrorHandler(`Invalid quantity for ${product.name}`, 400));
        }
        if (product.stock < quantity) {
            return next(new ErrorHandler(
                `Only ${product.stock} left of ${product.name}`, 400
            ));
        }

        lines.push({
            product: product._id,
            name: product.name,
            quantity,
            price: product.price,
            vendorPrice: product.vendorPrice,
            image: item.image || product.images?.[0]?.url || '',
        });
    }

    // ── Validate and CAP the coupon ──
    let couponData = null;
    let discount = 0;
    let coupon = null;

    if (couponCode) {
        if (req.user.role !== 'user') {
            return next(new ErrorHandler("Coupons are only applicable for customer orders", 403));
        }

        const Coupon = require('../models/couponModel');
        coupon = await Coupon.findOne({ code: String(couponCode).toUpperCase() });

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

        const itemsSubtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
        if (itemsSubtotal < coupon.minPurchaseAmount) {
            return next(new ErrorHandler(
                `Minimum purchase amount of ₹${coupon.minPurchaseAmount} required`, 400
            ));
        }

        // Capped at the margin the cart actually contains. A discount is paid
        // out of the platform's cut and nothing else — a bigger one means the
        // platform is funding the vendor's price, and on an investor-funded
        // unit it means paying the investor out of pocket while the ledger
        // still reports a profit.
        const available = marginInCart(lines);
        discount = Math.min(coupon.calculateDiscount(itemsSubtotal), available);

        if (discount <= 0) {
            return next(new ErrorHandler(
                "This coupon cannot be applied to these items", 400
            ));
        }
    }

    const quote = priceOrder({ lines, settings, discount });

    // ── Verify the money actually arrived ──
    const verified = await verifyOrderPayment(paymentInfo.id, quote.total);
    if (verified.error) {
        return next(new ErrorHandler(verified.error, 400));
    }

    if (coupon) {
        couponData = {
            couponUsed: coupon._id,
            couponCode: coupon.code,
            discountAmount: quote.discountAmount,
        };
        coupon.usedBy.push({
            user: req.user._id,
            usedAt: new Date(),
            orderAmount: quote.itemsPrice,
        });
        coupon.usageCount += 1;
        await coupon.save();
    }

    for (const line of lines) {
        await updateStock(line.product, line.quantity);
    }

    const order = await Order.create({
        shippingInfo,
        // Rebuilt from the database, so a tampered name, image or price in the
        // request body cannot reach the order or the ledger.
        orderItems: lines.map((l) => ({
            name: l.name,
            price: l.price,
            quantity: l.quantity,
            image: l.image,
            product: l.product,
        })),
        paymentInfo: { id: paymentInfo.id, status: verified.status },
        itemsPrice: quote.itemsPrice,
        taxPrice: quote.taxPrice,
        shippingPrice: quote.shippingPrice,
        totalPrice: quote.total,
        ...couponData,
        paidAt: Date.now(),
        user: req.user._id,
        orderStatus: "Confirmed",
        statusHistory: [{
            status: "Confirmed",
            timestamp: Date.now(),
            note: "Order placed and payment confirmed",
        }],
    });

    // Marketplace matching — pairs investor-funded units with this sale and
    // snapshots the return policy. Moves no money (see settleOrder).
    await settleOrder(order);

    try {
        await sendEmail({
            email: req.user.email,
            templateId: process.env.SENDGRID_ORDER_TEMPLATEID,
            data: {
                name: req.user.name,
                shippingInfo,
                orderItems: order.orderItems,
                totalPrice: quote.total,
                discountAmount: quote.discountAmount,
                finalAmount: quote.total,
                oid: order._id,
            },
        });
    } catch (err) {
        // A paid order must not fail because a mail template is misconfigured.
        console.error('Order confirmation email failed:', err.message);
    }

    res.status(201).json({
        success: true,
        order,
    });
});

/**
 * Confirms a payment exists at the gateway and covers `expected`.
 *
 * Returns `{ status }` or `{ error }`. The amount check is the important half:
 * a real-but-smaller payment (₹1 against a ₹341.60 cart) is exactly the attack
 * a signature check alone does not catch, because the signature is valid.
 *
 * A one-rupee tolerance absorbs the 2dp rounding between the client's quote and
 * the server's; anything beyond that is a mismatch and is refused.
 */
async function verifyOrderPayment(paymentId, expected) {
    const { getRazorpayInstance, isPaymentsMocked } = require('../utils/razorpayInstance');

    if (isPaymentsMocked()) {
        // Mock mode still enforces the SHAPE, so the dev flow exercises the
        // same path. The mock id carries the amount it was created for.
        const match = /^mock_pay_(\d+)_/.exec(paymentId);
        if (!match) {
            return { error: 'Payment could not be verified. Please try checkout again.' };
        }
        const paid = Number(match[1]) / 100;
        if (paid + 1 < expected) {
            return { error: `This payment is for ₹${paid.toFixed(2)} but the order comes to ₹${expected.toFixed(2)}` };
        }
        return { status: 'captured (mock)' };
    }

    let payment;
    try {
        payment = await getRazorpayInstance().payments.fetch(paymentId);
    } catch (err) {
        return { error: 'That payment could not be found at the gateway' };
    }

    if (!payment || !['captured', 'authorized'].includes(payment.status)) {
        return { error: `Payment is not complete (status: ${payment?.status || 'unknown'})` };
    }

    const paid = Number(payment.amount) / 100;
    if (paid + 1 < expected) {
        return {
            error: `This payment is for ₹${paid.toFixed(2)} but the order comes to `
                + `₹${expected.toFixed(2)}`,
        };
    }

    return { status: payment.status };
}

/**
 * What a cart costs ---CUSTOMER
 *
 * Phase 23. The checkout used to add up the cart itself, apply its own GST
 * rate and its own ₹200-under-₹5,000 shipping rule, and charge that. Since
 * `/order/new` now verifies the payment against a SERVER-computed total, any
 * disagreement between the two — a changed GST rate, a changed shipping fee, a
 * stale price in the client's product cache — refuses the order AFTER the
 * customer has paid.
 *
 * So the client asks for the figure it is about to charge. One authority,
 * `utils/orderTotals.priceOrder`, used by the quote, by the coupon validator
 * and by the order itself.
 */
exports.quoteOrder = asyncErrorHandler(async (req, res, next) => {
    const { items, couponCode } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return next(new ErrorHandler("An order needs at least one item", 400));
    }

    const settings = await PlatformSettings.getSingleton();
    const lines = [];

    for (const item of items) {
        const product = await Product.findById(item.product);

        if (!product) {
            return next(new ErrorHandler("One of these products no longer exists", 404));
        }
        if (product.listingStatus !== 'live') {
            return next(new ErrorHandler(`${product.name} is no longer available`, 400));
        }

        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) {
            return next(new ErrorHandler(`Invalid quantity for ${product.name}`, 400));
        }

        lines.push({
            product: product._id,
            name: product.name,
            quantity,
            price: product.price,
            vendorPrice: product.vendorPrice,
            // Surfaced so the cart can warn before checkout rather than failing
            // at payment time.
            stock: product.stock,
            inStock: product.stock >= quantity,
        });
    }

    let discount = 0;
    let couponError = null;

    if (couponCode) {
        const Coupon = require('../models/couponModel');
        const coupon = await Coupon.findOne({ code: String(couponCode).toUpperCase() });
        const itemsSubtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

        if (!coupon) {
            couponError = 'Invalid coupon code';
        } else if (!coupon.isValid().valid) {
            couponError = coupon.isValid().message;
        } else if (!coupon.canUserUse(req.user._id).canUse) {
            couponError = coupon.canUserUse(req.user._id).message;
        } else if (itemsSubtotal < coupon.minPurchaseAmount) {
            couponError = `Minimum purchase amount of ₹${coupon.minPurchaseAmount} required`;
        } else {
            // The same margin cap /order/new applies, so the quoted total is
            // the one that will be accepted.
            discount = Math.min(coupon.calculateDiscount(itemsSubtotal), marginInCart(lines));
            if (discount <= 0) couponError = 'This coupon cannot be applied to these items';
        }
    }

    const quote = priceOrder({ lines, settings, discount });

    res.status(200).json({
        success: true,
        quote: {
            itemsPrice: quote.itemsPrice,
            discountAmount: quote.discountAmount,
            taxPrice: quote.taxPrice,
            shippingPrice: quote.shippingPrice,
            // THE number to charge.
            total: quote.total,
            gstPct: settings.gstPct,
        },
        items: lines.map((l) => ({
            product: String(l.product),
            name: l.name,
            quantity: l.quantity,
            price: l.price,
            inStock: l.inStock,
            stock: l.stock,
        })),
        // Anything out of stock refuses the order, so the cart should say so
        // before the customer pays.
        unavailable: lines.filter((l) => !l.inStock).map((l) => l.name),
        ...(couponError ? { couponError } : {}),
    });
});

// Get Single Order Details
exports.getSingleOrderDetails = asyncErrorHandler(async (req, res, next) => {

    const order = await Order.findById(req.params.id).populate("user", "name email _id");

    if (!order) {
        return next(new ErrorHandler("Order Not Found", 404));
    }

    // Phase 22 — the request on this order, if any, so the customer sees their
    // own pending/declined request and admin sees what to decide without a
    // second round trip.
    const OrderRequest = require('../models/orderRequestModel');
    const request = await OrderRequest.findOne({ order: order._id })
        .sort({ createdAt: -1 })
        .populate('decidedBy', 'name');

    res.status(200).json({
        success: true,
        order,
        request: request || null,
    });
});


// Get Logged In User Orders
exports.myOrders = asyncErrorHandler(async (req, res, next) => {

    // Newest first. Left unsorted this returned insertion order, so a customer
    // with a long history landed on their oldest purchase and had to scroll to
    // find the order they just placed. Sorted here rather than in the client so
    // the web app and the mobile app agree without either of them re-sorting —
    // and it matches the vendor and investor listings, which already do this.
    const orders = await Order.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .populate("user", "name email _id");

    if (!orders) {
        return next(new ErrorHandler("Order Not Found", 404));
    }

    res.status(200).json({
        success: true,
        orders,
    });
});


// Get All Orders ---ADMIN
exports.getAllOrders = asyncErrorHandler(async (req, res, next) => {

    // Newest first, same as the customer, vendor and investor listings. This
    // was unsorted, so admin opened on the oldest order in the system and had
    // to page to the end to find the one they were asked about.
    const orders = await Order.find()
        .sort({ createdAt: -1 })
        .populate("user", "name email _id");

    if (!orders) {
        return next(new ErrorHandler("Order Not Found", 404));
    }

    let totalAmount = 0;
    orders.forEach((order) => {
        totalAmount += order.totalPrice;
    });

    res.status(200).json({
        success: true,
        orders,
        totalAmount,
    });
});

// Update Order Status ---ADMIN
exports.updateOrder = asyncErrorHandler(async (req, res, next) => {

    const order = await Order.findById(req.params.id);

    if (!order) {
        return next(new ErrorHandler("Order Not Found", 404));
    }

    const { status, note } = req.body;

    // Validate status
    const validStatuses = ["Pending", "Confirmed", "Processing", "Packed", "Shipped", "Delivered", "Cancelled", "Returned", "Replaced"];
    if (!validStatuses.includes(status)) {
        return next(new ErrorHandler("Invalid order status", 400));
    }

    // Phase 21 — Delivered is no longer the end of the line. A delivered order
    // can still be Returned or Replaced while its window is open, so only those
    // two are allowed out of it.
    if (order.orderStatus === "Delivered" && !["Returned", "Replaced"].includes(status)) {
        return next(new ErrorHandler("A delivered order can only be returned or replaced", 400));
    }

    // Prevent updating if already cancelled
    if (order.orderStatus === "Cancelled") {
        return next(new ErrorHandler("Cannot update status of cancelled order", 400));
    }

    if (order.orderStatus === "Returned") {
        return next(new ErrorHandler("Cannot update status of returned order", 400));
    }

    // A replaced order is still in the customer's hands, so it can still be
    // returned — but it must not be walked backwards into the shipping flow.
    if (order.orderStatus === "Replaced" && !["Returned", "Replaced"].includes(status)) {
        return next(new ErrorHandler(
            "A replaced order can only be returned from here",
            400
        ));
    }

    // A return or a replacement only makes sense on something the customer
    // actually has. Cancellation is the path for anything earlier.
    if (["Returned", "Replaced"].includes(status)
        && !["Delivered", "Replaced"].includes(order.orderStatus)) {
        return next(new ErrorHandler(
            `An order can only be ${status.toLowerCase()} after it has been delivered — `
            + `cancel it instead`,
            400
        ));
    }

    // Status flow validation (prevent going backward)
    const statusFlow = {
        "Pending": 0,
        "Confirmed": 1,
        "Processing": 2,
        "Packed": 3,
        "Shipped": 4,
        "Delivered": 5,
        "Cancelled": -1, // Can cancel at any stage
        "Returned": -1,  // Gated by the delivered check above, not by order
        "Replaced": -1,
    };

    const currentStatusLevel = statusFlow[order.orderStatus];
    const newStatusLevel = statusFlow[status];

    // Allow cancellation at any stage
    if (!["Cancelled", "Returned", "Replaced"].includes(status) && newStatusLevel < currentStatusLevel) {
        return next(new ErrorHandler(`Cannot change status from ${order.orderStatus} to ${status}`, 400));
    }

    // Restore stock when order is cancelled
    let reversalFailures = [];
    if (status === "Cancelled" && order.orderStatus !== "Cancelled") {
        reversalFailures = await applyCancellation(order);
    }

    let refund = null;
    if (status === "Returned") {
        const result = await applyReturn(order, { note, decidedBy: req.user._id });
        if (result.error) return next(new ErrorHandler(result.error, 400));
        refund = result.refund;
    }

    if (status === "Replaced") {
        const result = await applyReplacement(order);
        if (result.error) return next(new ErrorHandler(result.error, 400));
    }

    // Update timestamps based on status
    if (status === "Packed" && !order.packedAt) {
        order.packedAt = Date.now();
    }
    if (status === "Shipped" && !order.shippedAt) {
        order.shippedAt = Date.now();
    }
    if (status === "Cancelled" && !order.cancelledAt) {
        order.cancelledAt = Date.now();
        if (note) {
            order.cancellationReason = note;
        }
    }

    // ── Phase 21: delivery starts the return clock ───────────────────────
    //
    // Stamped here and nowhere else, which is what makes "nothing matures
    // before delivery" structural rather than a rule someone has to remember.
    // Lines that are not refundable come back as due immediately and are paid
    // in this same request rather than waiting for tomorrow's cron.
    let settledNow = [];
    if (status === "Delivered" && !order.deliveredAt) {
        order.deliveredAt = Date.now();
        const dueNow = stampMaturity(order, order.deliveredAt);
        await order.save({ validateBeforeSave: false });
        if (dueNow.length > 0) {
            settledNow = await settleOrderItems(order, dueNow);
        }
    }

    // Add to status history
    order.statusHistory.push({
        status: status,
        timestamp: Date.now(),
        updatedBy: req.user._id,
        note: note || `Status updated to ${status}`
    });

    // Update order status
    order.orderStatus = status;

    await order.save({ validateBeforeSave: false });

    res.status(200).json({
        success: true,
        message: `Order status updated to ${status}`,
        order,
        // Present only when the transition actually did one of these, so the
        // admin UI can report what moved instead of implying a silent success.
        ...(refund ? { refund } : {}),
        ...(settledNow.length > 0 ? { settled: settledNow } : {}),
        // Lines whose already-matured money could not be clawed back (an
        // investor who has withdrawn it). The status change still went through;
        // these need settling by hand.
        ...(reversalFailures.length > 0 ? { reversalFailures } : {}),
    });
});

/**
 * Refund the customer for the lines they sent back.
 *
 * The money is the customer's own, and the platform is still holding it
 * precisely because settlement waits — nobody has been paid, so there is no
 * vendor or investor balance to recover it from.
 *
 * A failure here does NOT abort the return: the goods are already back, and
 * refusing to record that would leave the order in a state that matches
 * neither the warehouse nor the customer's expectation. `refundId: null` on the
 * order is the flag for money the platform still owes by hand.
 */
async function refundOrderItems(order, items, reason) {
    // ── Why this is a PROPORTION of what was charged ──────────────────────
    //
    // `order.totalPrice` is the only figure that is definitely what the
    // customer paid: the checkout adds GST on top of the line prices, adds
    // shipping under ₹5,000, and subtracts any coupon — and the order schema
    // keeps none of those three separately.
    //
    // Pricing a refund off `product.price` (as settlement correctly does)
    // would therefore hand back the pre-tax, pre-shipping figure and
    // short-change the customer: ₹120 against the ₹141.60 they actually paid.
    //
    // Allocating `totalPrice` across the returned lines in proportion to their
    // value spreads the tax, the shipping and the discount automatically, and
    // a full return lands on exactly `totalPrice`. It also cannot exceed what
    // was captured, which is the property worth having here.
    //
    // SHIPPING IS REFUNDED, deliberately. A full return hands back the whole
    // charge including the ₹200 delivery, and a partial return hands back that
    // line's share of it. Most retailers keep the shipping on a change-of-mind
    // return — if you want that, deduct `order.shippingPrice` here when the
    // request's reason is not a fault. Refunding it is the customer-favourable
    // default and the one that needs no judgement call per return.
    const lineValue = (item) => Number(item.price || 0) * Number(item.quantity || 0);
    const orderValue = order.orderItems.reduce((sum, item) => sum + lineValue(item), 0);
    const returningValue = items.reduce((sum, item) => sum + lineValue(item), 0);

    const charged = Number(order.totalPrice || 0);
    const amount = orderValue > 0
        ? Number(Math.min((returningValue / orderValue) * charged, charged).toFixed(2))
        : 0;

    const paymentId = order.paymentInfo?.id;
    if (!paymentId || amount <= 0) {
        return { amount, refundId: null, error: 'No gateway payment to refund against' };
    }

    try {
        const { getRazorpayInstance } = require('../utils/razorpayInstance');
        const refund = await getRazorpayInstance().payments.refund(paymentId, {
            amount: Math.round(amount * 100),
            notes: { reason: reason || 'Customer return', order: String(order._id) },
        });

        order.refundId = refund.id;
        return { amount, refundId: refund.id, status: refund.status };
    } catch (err) {
        order.refundId = null;
        return { amount, refundId: null, error: err.message };
    }
}

async function updateStock(id, quantity) {
    const product = await Product.findById(id);
    product.stock -= quantity;
    await product.save({ validateBeforeSave: false });
}

async function restoreStock(id, quantity) {
    const product = await Product.findById(id);
    product.stock += quantity;
    await product.save({ validateBeforeSave: false });
}

// Delete Order ---ADMIN
exports.deleteOrder = asyncErrorHandler(async (req, res, next) => {

    const order = await Order.findById(req.params.id);

    if (!order) {
        return next(new ErrorHandler("Order Not Found", 404));
    }

    await order.remove();

    res.status(200).json({
        success: true,
    });
});