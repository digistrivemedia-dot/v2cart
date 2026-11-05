const mongoose = require('mongoose');

/**
 * A customer's request to cancel or return an order — Phase 22.
 *
 * The customer asks; admin decides. Nothing about the order or anyone's money
 * moves until approval, which is why this is its own document rather than a
 * couple of fields on the order: a request has its own lifecycle, its own
 * evidence (the photos) and its own audit trail, and a rejected one has to
 * survive so the order stays closed to further requests.
 *
 * Approving dispatches into the flows Phase 21 already built — the Cancelled,
 * Returned and Replaced branches of orderController.updateOrder. This model
 * decides nothing financial on its own.
 */
const orderRequestSchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.ObjectId,
        ref: "Order",
        required: true
    },
    // Denormalised so "my requests" and the admin queue need no join to filter
    // by owner, and so a request still names its customer if the order is ever
    // removed.
    user: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true
    },
    // Keyed on delivery, not chosen freely: an undelivered order can only be
    // cancelled, a delivered one can only be returned. utils/orderRequest.js
    // owns that rule.
    type: {
        type: String,
        enum: ['cancel', 'return'],
        required: true
    },
    // What the customer wants out of a return. Null on a cancellation.
    //
    // Only ever offered when the items' snapshotted policy allows both; a
    // replacement-only product fills this in server-side, because there is no
    // choice to present.
    mode: {
        type: String,
        enum: ['refund', 'replacement', null],
        default: null
    },
    // The lines being returned. Empty on a cancellation, which always applies
    // to the whole order — nothing has shipped, so there is nothing to split.
    items: [
        {
            product: {
                type: mongoose.Schema.ObjectId,
                ref: "Product",
                required: true
            },
            name: String,
            quantity: Number,
        }
    ],
    reason: {
        type: String,
        required: [true, "Please tell us why"],
        maxLength: [1000, "Message cannot exceed 1000 characters"],
        trim: true
    },
    // Cloudinary, same as product images. Returns only — there is nothing to
    // photograph on an order that has not arrived.
    images: [
        {
            public_id: { type: String, required: true },
            url: { type: String, required: true },
        }
    ],
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    // Shown to the customer, which is why rejecting requires one: "declined"
    // with no reason is the worst possible version of this feature.
    adminNote: {
        type: String,
        maxLength: [500, "Note cannot exceed 500 characters"],
        default: null
    },
    decidedBy: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        default: null
    },
    decidedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
});

// The pause check in utils/settlement.js runs this on every maturation pass:
// "does this order have a pending request". It has to be cheap.
orderRequestSchema.index({ order: 1, status: 1 });
orderRequestSchema.index({ status: 1, createdAt: -1 });
orderRequestSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("OrderRequest", orderRequestSchema);
