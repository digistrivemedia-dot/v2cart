const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    shippingInfo: {
        address: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        country: {
            type: String,
            required: true
        },
        pincode: {
            type: Number,
            required: true
        },
        phoneNo: {
            type: Number,
            required: true
        },
    },
    orderItems: [
        {
            name: {
                type: String,
                required: true
            },
            price: {
                type: Number,
                required: true
            },
            quantity: {
                type: Number,
                required: true
            },
            image: {
                type: String,
                required: true
            },
            product: {
                type: mongoose.Schema.ObjectId,
                ref: "Product",
                required: true
            },
            // Investments matched to this line item's units at settlement
            // time (one per unit funded, FIFO — see MARKETPLACE_CONVERSION_PLAN.md).
            // Used by cancellation to re-pool exactly these investments.
            matchedInvestments: [{
                type: mongoose.Schema.ObjectId,
                ref: "Investment"
            }],

            // --- Phase 21: return window + deferred settlement, per line ---
            //
            // Per ITEM and not per order, because the policy is per product: a
            // 3-day memory card and a 7-day tile in one cart mature on
            // different days.
            //
            // Snapshotted from the product at order time, for the same reason
            // an Investment snapshots its margin bands — admin shortening a
            // product's window later must not shorten the right a customer has
            // already bought.
            returnPolicy: {
                type: String,
                enum: ['full', 'replacement_only', 'none'],
                default: 'full'
            },
            returnWindowDays: {
                type: Number,
                default: 0
            },
            // When this line's money becomes the vendor's and the investor's:
            // `deliveredAt + returnWindowDays`, or `deliveredAt` itself for
            // anything not refundable. Null until the order is delivered, which
            // is what makes "nothing can mature before delivery" structural
            // rather than a condition someone has to remember to write.
            maturesAt: {
                type: Date,
                default: null
            },
            // Stamped when the ledger rows and wallet credits were actually
            // written. The idempotency guard for maturation: a line with this
            // set is never settled twice, however many times the cron fires.
            settledAt: {
                type: Date,
                default: null
            },
            returnedAt: {
                type: Date,
                default: null
            },
            // Record-keeping only — a replacement moves no money, but the
            // vendor needs to know they owe a unit.
            replacedAt: {
                type: Date,
                default: null
            },
        },
    ],
    user: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true
    },
    paymentInfo: {
        id: {
            type: String,
            required: true
        },
        status: {
            type: String,
            required: true
        },
    },
    paidAt: {
        type: Date,
        required: true
    },
    totalPrice: {
        type: Number,
        required: true,
        default: 0
    },
    // Coupon information
    couponUsed: {
        type: mongoose.Schema.ObjectId,
        ref: "Coupon",
        default: null
    },
    couponCode: {
        type: String,
        default: null
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    // Phase 23 — the breakdown behind `totalPrice`.
    //
    // The checkout has always SENT these three and the schema has always
    // dropped them, leaving one lump sum. That made an invoice impossible to
    // reconstruct, a GST return impossible to file, and a refund impossible to
    // price correctly (a refund off the listing price short-changed the
    // customer by exactly the tax and the shipping).
    //
    // Computed server-side by utils/orderTotals.js, never taken from the
    // request body — the client's figure is only ever compared against it.
    itemsPrice: {
        type: Number,
        default: 0
    },
    // GST. Collected on behalf of the government: it belongs to no vendor, no
    // investor and not to the platform, which is why it is kept out of the
    // profit ledger entirely.
    taxPrice: {
        type: Number,
        default: 0
    },
    shippingPrice: {
        type: Number,
        default: 0
    },
    orderStatus: {
        type: String,
        required: true,
        enum: [
            "Pending",
            "Confirmed",
            "Processing",
            "Packed",
            "Shipped",
            "Delivered",
            "Cancelled",
            // Phase 21. `Returned` is the post-delivery counterpart of
            // `Cancelled`: the customer is refunded and nobody is paid.
            // `Replaced` moves no money at all — the sale stands, the customer
            // keeps a product they paid for, and the vendor absorbs the cost of
            // the second unit.
            "Returned",
            "Replaced"
        ],
        default: "Confirmed", // Default to Confirmed after payment
    },
    statusHistory: [
        {
            status: {
                type: String,
                enum: ["Pending", "Confirmed", "Processing", "Packed", "Shipped", "Delivered", "Cancelled", "Returned", "Replaced"]
            },
            timestamp: {
                type: Date,
                default: Date.now
            },
            updatedBy: {
                type: mongoose.Schema.ObjectId,
                ref: "User"
            },
            note: String
        }
    ],
    packedAt: Date,
    shippedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
    returnedAt: Date,
    returnReason: String,
    // Razorpay refund id, when a return refunded the customer. Null means the
    // refund call failed or there was nothing to refund against — money the
    // platform still owes, which is why it is recorded rather than assumed.
    refundId: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
});

// The maturation query: "delivered lines whose window has closed and which
// have not been paid out yet". Runs on a schedule, so it gets an index.
orderSchema.index({ 'orderItems.maturesAt': 1, 'orderItems.settledAt': 1 });

module.exports = mongoose.model("Order", orderSchema);