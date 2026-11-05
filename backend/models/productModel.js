const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please enter product name"],
        trim: true,
        maxlength: [200, "Product name cannot exceed 200 characters"]
    },
    description: {
        type: String,
        required: [true, "Please enter product description"]
    },
    shortDescription: {
        type: String,
        required: false
    },
    highlights: [
        {
            type: String,
            required: false,
            trim: true
        }
    ],
    careInstructions: [
        {
            title: {
                type: String,
                required: false,
                trim: true
            },
            description: {
                type: String,
                required: false,
                trim: true
            }
        }
    ],
    specifications: [
        {
            title: {
                type: String,
                required: false,
                trim: true
            },
            description: {
                type: String,
                required: false,
                trim: true
            }
        }
    ],
    // Customer-facing retail price, and the one number every other price on
    // this product is derived from: the vendor lists at this price and the
    // customer pays exactly it. Not required at the schema level because a
    // vendor can save a draft before naming a price (pricingStatus).
    price: {
        type: Number,
        required: false,
        min: [0, "Price cannot be negative"]
    },
    cuttedPrice: {
        type: Number,
        required: false,
        min: [0, "Cutted price cannot be negative"]
    },

    // --- Marketplace pricing/listing (see MARKETPLACE_CONVERSION_PLAN.md) ---

    // What the vendor RECEIVES per unit sold — derived, never typed in:
    // price / (1 + marginPct/100). The remainder is the platform's margin.
    vendorPrice: {
        type: Number,
        required: false,
        min: [0, "Vendor price cannot be negative"]
    },
    // Amount an investor pays to fund one unit. Derived — equal to
    // vendorPrice, i.e. an investor fronts exactly the vendor's cut.
    investorPrice: {
        type: Number,
        required: false,
        min: [0, "Investor price cannot be negative"]
    },
    // Amount an investor receives when their funded unit sells, under this
    // product's CURRENT band — a forecast, not a contract.
    //
    // Phase 20 changed what this means. It used to equal `price`, so an
    // investor always earned exactly marginPct. The return now depends on how
    // long their unit took to sell (utils/marginBands.js), so a single number
    // can only ever be an estimate: it is kept for the listing cards and the
    // portfolio totals, and the real figure is computed per investment at
    // settlement from the snapshot taken when they invested. Payloads that need
    // to be honest about the spread send the whole payoutRange() alongside it.
    investorPayout: {
        type: Number,
        required: false,
        min: [0, "Investor payout cannot be negative"]
    },
    // Phase 20 — what an investor earns on this product, by how long their unit
    // takes to sell. Admin sets these when they approve the listing; iPhone 15
    // and iPhone 14 are both phones and want different numbers, which is why
    // this is per-product and not on the category (where Phase 16 put it).
    //
    // All six numbers null means "use settings.defaultMarginBands". Validation
    // (all-or-nothing, ascending days, non-decreasing pct, pct <= the product's
    // platform margin) lives in utils/marginBands.js so every caller shares one
    // rule.
    //
    // Editing these never reaches an existing investment: each Investment
    // snapshots the bands at invest time.
    marginBands: {
        low: {
            days: { type: Number, default: null, min: 1 },
            pct: { type: Number, default: null, min: 0, max: 100 },
        },
        medium: {
            days: { type: Number, default: null, min: 1 },
            pct: { type: Number, default: null, min: 0, max: 100 },
        },
        high: {
            days: { type: Number, default: null, min: 1 },
            pct: { type: Number, default: null, min: 0, max: 100 },
        },
    },
    // The band admin assigns at approval, before the product has sold anything.
    // A starting forecast only — it decides nobody's payout, and observed sales
    // override it (see labelFor in utils/marginBands.js). A product is in
    // exactly one band at a time by construction, since this is one value.
    marginCategory: {
        type: String,
        enum: ['low', 'medium', 'high', null],
        default: null
    },
    // When this listing first went live. The clock the unsold-product label
    // runs on — deliberately not `createdAt`, since a vendor's listing can sit
    // in pending_approval for days and billing the product for admin's review
    // delay would push genuinely fast listings into a slower band. Stamped once
    // and never rewritten.
    liveAt: {
        type: Date,
        default: null
    },
    // Phase 21 — how long after DELIVERY a customer may send this unit back,
    // and what they may ask for. Null on both means "use
    // settings.defaultReturnPolicy / defaultReturnWindowDays" (7-day full
    // return), which is why existing products need no backfill.
    //
    // This is what defers settlement: a `full` product pays nobody until
    // `deliveredAt + returnWindowDays`, because until then the platform may
    // still have to hand the customer their money back. `replacement_only` and
    // `none` pay at delivery — a swap costs the vendor a unit, not the investor
    // their payout. RAM and memory cards are the `none` case.
    //
    // All rules (resolution, validation, when a window is open, when money
    // matures) live in utils/returnPolicy.js so every caller shares one.
    //
    // A window NEVER changes an amount, only the date money moves: the band
    // percentage is still measured from `matchedAt`, since the investor's
    // capital stopped being at risk when the unit sold.
    returnPolicy: {
        type: String,
        enum: ['full', 'replacement_only', 'none', null],
        default: null
    },
    returnWindowDays: {
        type: Number,
        required: false,
        default: null,
        min: [0, "A return window cannot be negative"],
        max: [180, "A return window that long holds the vendor's money too long"]
    },
    // Cap on how many units may ever be investor-funded. Null (the default)
    // means "however many are in stock", and every read resolves it as
    // `investableUnits ?? stock`.
    //
    // This used to be frozen to the stock count by a pre-save hook at
    // creation. That silently broke as soon as a vendor restocked: a product
    // created with 3 units kept a cap of 3 after stock went to 10, so once
    // 3 units were funded it showed 0 remaining and vanished from the
    // investor listing (which defaults to hiding fully-funded products) while
    // still appearing for customers. Leaving it null lets the cap track stock
    // on its own; admin can still set a number here to cap it lower.
    investableUnits: {
        type: Number,
        required: false,
        default: null,
        min: [0, "Investable units cannot be negative"]
    },
    // Whether admin has set price/investorPrice/investorPayout yet.
    pricingStatus: {
        type: String,
        enum: ['pending_pricing', 'priced'],
        default: 'pending_pricing'
    },
    // Whether this listing is visible to customers/investors. Vendor-created
    // products start at 'draft'; admin-created products are
    // stamped 'live' immediately at creation (see productController).
    listingStatus: {
        type: String,
        enum: ['draft', 'pending_approval', 'live', 'rejected', 'paused'],
        default: 'draft'
    },
    // Optional note admin leaves when rejecting a listing —
    // shown to the vendor. Cleared whenever the status changes away from
    // 'rejected'.
    rejectionNote: {
        type: String,
        maxLength: [500, "Rejection note cannot exceed 500 characters"],
        default: null
    },
    // Per-product margin override, admin-only. Null (the default) means
    // "follow the global margin" — see platformSettingsModel.js.
    //
    // This stores the product's OWN margin rather than a flag that excludes it
    // from recalculation. That distinction matters: an opted-out product would
    // keep a stale vendorPrice forever once the global margin moved, and quietly
    // pay its vendor the wrong amount. Here every recalculation still visits
    // every product, it just resolves which margin applies (resolveMarginPct in
    // utils/pricingCalculator.js), so an overridden product is recomputed to the
    // same numbers instead of being skipped.
    marginPct: {
        type: Number,
        required: false,
        default: null,
        min: [0, "Margin cannot be negative"]
    },
    images: [
        {
            public_id: {
                type: String,
                required: true
            },
            url: {
                type: String,
                required: true
            },
            isFeatured: {
                type: Boolean,
                default: false
            }
        }
    ],
    category: {
        type: mongoose.Schema.ObjectId,
        ref: "Category",
        required: [true, "Please select product category"]
    },
    subcategory: {
        type: mongoose.Schema.ObjectId,
        ref: "Category",
        required: false
    },

    // Product ID (SKU or custom identifier)
    productId: {
        type: String,
        required: false,
        trim: true,
        sparse: true, // Allow multiple null values but unique non-null values
        index: true
    },

    size: {
        type: String,
        required: false,
        trim: true
    },

    material: {
        type: String,
        required: false,
        trim: true
    },

    finish: {
        type: String,
        required: false,
        trim: true
    },

    color: {
        type: String,
        required: false,
        trim: true
    },

    // FIX: Tags array to store both quality tags and room type tags from frontend
    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],

    // Product Variants
    hasVariants: {
        type: Boolean,
        default: false
    },
    variants: [{
        productId: {
            type: String,
            required: false,
            trim: true
        },
        color: {
            type: String,
            required: false,
            trim: true
        },
        size: {
            type: String,
            required: false,
            trim: true
        },
        finish: {
            type: String,
            required: false,
            trim: true
        },
        material: {
            type: String,
            required: false,
            trim: true
        },
        price: {
            type: Number,
            required: false,
            min: [0, "Variant price cannot be negative"]
        },
        cuttedPrice: {
            type: Number,
            required: false,
            min: [0, "Variant cutted price cannot be negative"]
        },
        stock: {
            type: Number,
            required: false,
            min: [0, "Variant stock cannot be negative"],
            default: 0
        },
        images: [
            {
                public_id: {
                    type: String,
                    required: false
                },
                url: {
                    type: String,
                    required: false
                },
                isFeatured: {
                    type: Boolean,
                    default: false
                }
            }
        ]
    }],

    stock: {
        type: Number,
        required: [true, "Please enter product stock"],
        min: [0, "Stock cannot be negative"],
        default: 1
    },
    ratings: {
        type: Number,
        default: 0,
        min: [0, "Rating cannot be negative"],
        max: [5, "Rating cannot exceed 5"]
    },
    numOfReviews: {
        type: Number,
        default: 0,
        min: [0, "Number of reviews cannot be negative"]
    },
    reviews: [
        {
            user: {
                type: mongoose.Schema.ObjectId,
                ref: "User",
                required: true
            },
            name: {
                type: String,
                required: true,
                trim: true
            },
            rating: {
                type: Number,
                required: true,
                min: [1, "Rating must be at least 1"],
                max: [5, "Rating cannot exceed 5"]
            },
            comment: {
                type: String,
                required: true,
                trim: true
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    user: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true // Automatically manages createdAt and updatedAt
});

// Indexes for better query performance
productSchema.index({ category: 1, subcategory: 1 });
productSchema.index({ price: 1 });
productSchema.index({ ratings: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ name: 'text', description: 'text' }); // Text search
productSchema.index({ tags: 1 });

// Virtual for discount percentage
productSchema.virtual('discountPercentage').get(function () {
    if (this.cuttedPrice && this.cuttedPrice > this.price) {
        return Math.round(((this.cuttedPrice - this.price) / this.cuttedPrice) * 100);
    }
    return 0;
});

// Pre-save middleware to update updatedAt
productSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Pre-save middleware to ensure only one featured image
productSchema.pre('save', function (next) {
    if (this.images && this.images.length > 0) {
        let featuredCount = 0;
        let firstFeaturedIndex = -1;

        this.images.forEach((img, index) => {
            if (img.isFeatured) {
                featuredCount++;
                if (firstFeaturedIndex === -1) {
                    firstFeaturedIndex = index;
                }
            }
        });

        // If no featured image, make first one featured
        if (featuredCount === 0) {
            this.images[0].isFeatured = true;
        }
        // If multiple featured images, keep only the first one
        else if (featuredCount > 1) {
            this.images.forEach((img, index) => {
                img.isFeatured = index === firstFeaturedIndex;
            });
        }
    }
    next();
});

// Method to calculate average rating
productSchema.methods.calculateAverageRating = function () {
    if (this.reviews.length === 0) {
        this.ratings = 0;
        this.numOfReviews = 0;
    } else {
        const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
        this.ratings = (totalRating / this.reviews.length).toFixed(1);
        this.numOfReviews = this.reviews.length;
    }
};

// Static method to get products by category
productSchema.statics.findByCategory = function (categoryId) {
    return this.find({ category: categoryId }).populate('category subcategory');
};

// Static method to get featured products
productSchema.statics.findFeatured = function (limit = 10) {
    return this.find({ 'images.isFeatured': true })
        .sort({ ratings: -1, createdAt: -1 })
        .limit(limit)
        .populate('category subcategory');
};

// Ensure virtuals are included in JSON
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
