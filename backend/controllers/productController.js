const Product = require('../models/productModel');
const Investment = require('../models/investmentModel');
const Order = require('../models/orderModel');
const PlatformSettings = require('../models/platformSettingsModel');
const asyncErrorHandler = require('../middlewares/asyncErrorHandler');
const SearchFeatures = require('../utils/searchFeatures');
const ErrorHandler = require('../utils/errorHandler');
const cloudinary = require('cloudinary');
const { calculateGlobalPricing, resolveMarginPct } = require('../utils/pricingCalculator');
const { repriceInvestments } = require('../utils/repriceInvestments');
const {
    bandsError,
    normaliseBands,
    resolveBands,
    forecastPayout,
    payoutRange,
    buildBandResolver,
    isCompleteBands,
    BAND_KEYS,
} = require('../utils/marginBands');

const { getSalesVelocity, emptyVelocity } = require('../utils/salesVelocity');
const {
    resolveReturnPolicy,
    returnPolicyError,
    describeReturnPolicy,
} = require('../utils/returnPolicy');

const DAY_MS = 24 * 60 * 60 * 1000;
// The sales window constants live in utils/salesVelocity.js. Phase 20 took
// pricing off them entirely — velocity now feeds only the investor sparkline
// and the FIFO wait estimate, never the band or the price.

// Vendors may only mutate their own products; admin bypasses this check.
function isOwnerOrAdmin(req, product) {
    if (req.user.role === 'admin') {
        return true;
    }
    return product.user && product.user.toString() === req.user.id.toString();
}

// Fields a vendor may not set on their own listing. Note `price` is NOT here:
// since Phase 10 the vendor names their own listing price and everything else
// (their net, the investor's terms) is derived from it — those derived fields
// are what's off-limits, along with the publish/pricing status.
const ADMIN_ONLY_FIELDS = [
    'cuttedPrice', 'vendorPrice', 'investorPrice', 'investorPayout',
    'investableUnits', 'pricingStatus', 'listingStatus', 'marginPct',
    // Phase 20 — the investor's return and the clock it is measured on. A
    // vendor setting their own bands would be setting their own platform cut.
    'marginBands', 'marginCategory', 'liveAt',
    // Phase 21 — a vendor choosing their own return rules would be choosing
    // how long their own money is held, and could set every listing to
    // non-returnable to get paid at delivery.
    'returnPolicy', 'returnWindowDays',
];

function stripAdminOnlyFields(body) {
    for (const field of ADMIN_ONLY_FIELDS) {
        delete body[field];
    }
}

// Replaces a submitted listing price with the full derived price set, so the
// calculator is the only thing that can ever write vendorPrice/investorPrice/
// investorPayout. Returns false if no usable price was submitted (a vendor
// saving a draft before naming one). Call AFTER stripAdminOnlyFields.
//
// `product` is the existing doc on an update, so a product carrying its own
// margin override keeps being priced at that margin rather than silently
// reverting to the global one the next time anyone edits it.
async function applyListingPrice(body, product = null) {
    const listingPrice = Number(body.price);
    delete body.price;

    if (Number.isNaN(listingPrice) || listingPrice <= 0) return false;

    const settings = await PlatformSettings.getSingleton();

    // The margin is the product's own override or the global rate — nothing
    // else. Phase 17 resolved a product CATEGORY's tier percentage here, which
    // meant pricing depended on sales velocity and a brand-new listing could be
    // priced off a velocity that did not exist yet. Phase 20 deleted that
    // level: a band is the investor's cut OF this margin, never the margin.
    const marginPct = resolveMarginPct(
        { marginPct: body.marginPct ?? product?.marginPct ?? null },
        settings
    );

    Object.assign(body, calculateGlobalPricing(listingPrice, { marginPct }));

    // The investor's forecast payout follows from the bands, which the price
    // does not touch. Resolved off the submitted bands if this request is
    // setting them, else the stored ones, else the platform defaults.
    const bands = resolveBands(
        { marginBands: body.marginBands ?? product?.marginBands },
        settings
    );
    body.investorPayout = forecastPayout(
        body.investorPrice,
        bands,
        body.marginCategory ?? product?.marginCategory
    );
    return true;
}

// Get All Products
exports.getAllProducts = asyncErrorHandler(async (req, res, next) => {

    // Use limit from query params, default to 12
    const resultPerPage = Number(req.query.limit) || 12;
    const productsCount = await Product.countDocuments({ listingStatus: 'live' });
    // console.log(req.query);

    const searchFeature = new SearchFeatures(Product.find({ listingStatus: 'live' }), req.query)
        .search()
        .filter();

    await searchFeature.filterByCategory();

    let products = await searchFeature.query.populate('category subcategory', 'name slug');
    let filteredProductsCount = products.length;

    searchFeature.pagination(resultPerPage);

    products = await searchFeature.query.clone().populate('category subcategory', 'name slug');

    res.status(200).json({
        success: true,
        products,
        productsCount,
        resultPerPage,
        filteredProductsCount,
    });
});

// Get All Products ---Product Sliders
exports.getProducts = asyncErrorHandler(async (req, res, next) => {
    const products = await Product.find({ listingStatus: 'live' }).sort({ createdAt: -1 }).populate('category subcategory', 'name slug');

    res.status(200).json({
        success: true,
        products,
    });
});

// Get Product Details
exports.getProductDetails = asyncErrorHandler(async (req, res, next) => {

    const product = await Product.findById(req.params.id).populate('category subcategory', 'name slug');

    if (!product || product.listingStatus !== 'live') {
        return next(new ErrorHandler("Product Not Found", 404));
    }

    // Phase 21 — a customer has to be told what they can do if the product is
    // wrong, BEFORE they buy it. Resolved, so a product on the platform
    // default still states the real window rather than showing nothing.
    const settings = await PlatformSettings.getSingleton();

    res.status(200).json({
        success: true,
        product: {
            ...product.toObject(),
            ...returnInfo(product, settings),
        },
    });
});

// Get Single Product Details, any listingStatus ---ADMIN
// Same as getProductDetails but without the 'live' filter, since admin
// needs to open drafts and pending-approval products (e.g. to
// price and publish them) that the public endpoint correctly hides.
exports.getAdminProductDetails = asyncErrorHandler(async (req, res, next) => {

    const product = await Product.findById(req.params.id).populate('category subcategory', 'name slug');

    if (!product) {
        return next(new ErrorHandler("Product Not Found", 404));
    }

    // The margin that applies, plus the margin bands and the band this product
    // currently sits in — everything the admin pricing/approval panel needs to
    // show what the vendor is paid and what an investor would earn, without
    // re-deriving a money rule client-side.
    const settings = await PlatformSettings.getSingleton();
    const effectiveMarginPct = resolveMarginPct(product, settings);
    const resolveProductBands = await buildBandResolver([product], settings);
    const bandInfo = resolveProductBands(product);

    res.status(200).json({
        success: true,
        product: {
            ...product.toObject(),
            effectiveMarginPct,
            // Phase 21 — the return rules that apply, resolved so the panel
            // shows what the product will actually do rather than a null.
            ...returnInfo(product, settings),
            // Whether the figure came from this product or the global rate. No
            // 'category' source any more — categories carry no margin.
            marginSource: product.marginPct != null ? 'product' : 'global',
            ...bandInfo,
            // True when the product has no bands of its own, so the panel can
            // say "using the platform defaults" rather than showing numbers
            // that look like they were set deliberately.
            usesDefaultBands: !isCompleteBands(product.marginBands),
        },
    });
});

// Get All Products ---ADMIN
exports.getAdminProducts = asyncErrorHandler(async (req, res, next) => {
    const products = await Product.find().sort({ createdAt: -1 }).populate('category subcategory', 'name slug');

    // The band each product sits in, so the list can show it and the pending
    // tab can show what a product will do before admin approves it. Phase 16
    // left this column out because rendering it meant duplicating the investor
    // sales-velocity aggregation; it is one extra query over the page now.
    const settings = await PlatformSettings.getSingleton();
    const resolveProductBands = await buildBandResolver(products, settings);

    res.status(200).json({
        success: true,
        products: products.map((p) => ({
            ...p.toObject(),
            ...resolveProductBands(p),
            effectiveMarginPct: resolveMarginPct(p, settings),
            usesDefaultBands: !isCompleteBands(p.marginBands),
        })),
    });
});

// Get logged-in vendor's own products (any listingStatus — draft, pending, live, rejected, paused)
exports.getVendorProducts = asyncErrorHandler(async (req, res, next) => {
    const searchFeature = new SearchFeatures(Product.find({ user: req.user.id }), req.query)
        .search()
        .filter();

    const products = await searchFeature.query
        .sort({ createdAt: -1 })
        .populate('category subcategory', 'name slug');

    res.status(200).json({
        success: true,
        products,
    });
});

// Get live products open for investment ---INVESTOR
exports.getInvestorProducts = asyncErrorHandler(async (req, res, next) => {
    const searchFeature = new SearchFeatures(
        Product.find({ listingStatus: 'live', investorPrice: { $ne: null } }),
        req.query
    ).search().filter();

    const products = await searchFeature.query
        .sort({ createdAt: -1 })
        .populate('category subcategory', 'name slug');

    const productIds = products.map((p) => p._id);

    // Since Phase 20 the return RATE does distinguish two listings — it is the
    // band percentage, and it depends on how long the unit takes to sell. So an
    // investor needs both halves: what each band pays (payoutRange), and how
    // long their capital is likely to be tied up, which is a function of how
    // fast the product sells and how many unmatched investments are queued
    // ahead of theirs under FIFO. Both come from here.
    const settings = await PlatformSettings.getSingleton();

    const [investmentStats, resolveProductBands, velocityByProduct] = await Promise.all([
        Investment.aggregate([
            { $match: { product: { $in: productIds } } },
            {
                $group: {
                    _id: '$product',
                    count: { $sum: 1 },
                    // FIFO queue depth: units funded but not yet sold. A new
                    // investment sits behind all of these.
                    unmatched: {
                        $sum: { $cond: [{ $eq: ['$status', 'unmatched'] }, 1, 0] },
                    },
                    matched: {
                        $sum: { $cond: [{ $eq: ['$status', 'matched'] }, 1, 0] },
                    },
                    // Summed wait of everything that HAS sold, for a real
                    // observed average rather than a modelled one.
                    matchedMs: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ['$status', 'matched'] }, { $ne: ['$matchedAt', null] }] },
                                { $subtract: ['$matchedAt', '$createdAt'] },
                                0,
                            ],
                        },
                    },
                },
            },
        ]),
        // Each product's bands, the band it currently sits in, and the three
        // payouts it could pay. One query for the whole page.
        buildBandResolver(products, settings),
        // Sales velocity is now ONLY the investor sparkline and the FIFO wait
        // estimate. It stopped feeding the band in Phase 20, which is why
        // pricing no longer runs this aggregation at all.
        getSalesVelocity(productIds),
    ]);

    const statsByProduct = new Map(investmentStats.map((row) => [String(row._id), row]));

    const productsWithAvailability = products.map((p) => {
        const investableUnits = p.investableUnits ?? p.stock;
        const stats = statsByProduct.get(String(p._id));
        // Units on hand that are already funded. Was `count` (every investment
        // ever made), which double-counted each sale against the current stock
        // and made a selling product look fully funded — see
        // investmentController for the same fix on the write path.
        const investedUnits = stats?.unmatched || 0;
        const velocity = velocityByProduct.get(String(p._id)) || emptyVelocity();
        const bandInfo = resolveProductBands(p);

        return {
            ...p.toObject(),
            // --- Sell-speed analytics (investor decision support) ---
            salesByWeek: velocity.salesByWeek,
            unitsSoldRecent: velocity.unitsSoldRecent,
            unitsSoldWindow: velocity.unitsSoldWindow,
            salesWindowWeeks: velocity.salesWindowWeeks,
            recentWeeks: velocity.recentWeeks,
            // Units funded but unsold — a new investment queues behind these.
            queueAhead: stats?.unmatched || 0,
            unitsMatched: stats?.matched || 0,
            // Observed average days from investment to sale, null when nothing
            // has sold yet (the UI must say "no history" rather than imply 0).
            avgDaysToMatch: stats?.matched
                ? Number((stats.matchedMs / stats.matched / DAY_MS).toFixed(1))
                : null,
            // Resolved (never null) so the investor UI can show funding
            // progress and sort by "most invested" without re-deriving it.
            investableUnits,
            investedUnits,
            remainingInvestableUnits: Math.max(investableUnits - investedUnits, 0),
            // This product's own bands, the band it is in, and what each band
            // would pay on the investor's capital. `payoutRange` is the honest
            // version of a single "you receive ₹X": the return genuinely
            // depends on the wait, which is the thing the investor is judging.
            ...bandInfo,
            // Phase 21 — an investor needs this: it is how much longer their
            // capital is tied up after the unit sells before they are paid.
            ...returnInfo(p, settings),
            effectiveMarginPct: resolveMarginPct(p, settings),
        };
    });

    res.status(200).json({
        success: true,
        products: productsWithAvailability,
    });
});

// Create Product ---ADMIN
exports.createProduct = asyncErrorHandler(async (req, res, next) => {

    let images = [];
    if (typeof req.body.images === "string") {
        images.push(req.body.images);
    } else {
        images = req.body.images;
    }

    const imagesLink = [];

    for (let i = 0; i < images.length; i++) {
        const result = await cloudinary.v2.uploader.upload(images[i], {
            folder: "products",
        });

        imagesLink.push({
            public_id: result.public_id,
            url: result.secure_url,
            isFeatured: i === 0 ? true : false, // First image is featured by default
        });
    }

    req.body.images = imagesLink;
    req.body.user = req.user.id;

    if (req.user.role === 'vendor') {
        // Vendor supplies the listing price + catalog info. Their own net and
        // the investor's terms derive from it via the global margin; the
        // listing stays pending until admin approves it, so it
        // never publishes automatically.
        stripAdminOnlyFields(req.body);

        const hasPrice = await applyListingPrice(req.body);
        req.body.pricingStatus = hasPrice ? 'priced' : 'pending_pricing';
        req.body.listingStatus = hasPrice ? 'pending_approval' : 'draft';
    } else {
        // Admin creating directly — publish immediately, same as
        // the existing single-vendor admin workflow. Still derived, so the
        // vendor/investor split is right even on an admin-created product.
        await applyListingPrice(req.body);
        req.body.pricingStatus = 'priced';
        req.body.listingStatus = 'live';
        // Published right now, so the band clock starts right now. The approval
        // path stamps this too; an admin-created product never goes through it.
        req.body.liveAt = new Date();
    }

    if (req.body.specifications && Array.isArray(req.body.specifications)) {
        req.body.specifications = req.body.specifications.map(s =>
            typeof s === 'string' ? JSON.parse(s) : s
        );
    }

    // Handle care instructions
    if (req.body.careInstructions && Array.isArray(req.body.careInstructions)) {
        req.body.careInstructions = req.body.careInstructions.map(c =>
            typeof c === 'string' ? JSON.parse(c) : c
        );
    }

    // Handle tags (if it's a string, convert to array)
    if (req.body.tags && typeof req.body.tags === 'string') {
        req.body.tags = JSON.parse(req.body.tags);
    }

    // Handle variants with images
    if (req.body.variants && typeof req.body.variants === 'string') {
        const variants = JSON.parse(req.body.variants);

        // Process variant images
        const processedVariants = [];
        for (const variant of variants) {
            const variantData = { ...variant };

            // Upload variant images if they exist
            if (variant.images && Array.isArray(variant.images) && variant.images.length > 0) {
                const variantImagesLink = [];

                for (let i = 0; i < variant.images.length; i++) {
                    const result = await cloudinary.v2.uploader.upload(variant.images[i], {
                        folder: "products/variants",
                    });

                    variantImagesLink.push({
                        public_id: result.public_id,
                        url: result.secure_url,
                        isFeatured: i === (variant.featuredImageIndex || 0)
                    });
                }

                variantData.images = variantImagesLink;
                delete variantData.featuredImageIndex; // Remove this as we use isFeatured instead
            }

            // stripAdminOnlyFields only reaches top-level keys, and a
            // per-variant price would break the margin math: checkout charges
            // variant.price while settlement still pays the investor
            // product.price. Vendor variants inherit the product price.
            if (req.user.role === 'vendor') {
                delete variantData.price;
                delete variantData.cuttedPrice;
            }

            processedVariants.push(variantData);
        }

        req.body.variants = processedVariants;
    }

    const product = await Product.create(req.body);

    res.status(201).json({
        success: true,
        product
    });
});

// Update Product ---ADMIN
exports.updateProduct = asyncErrorHandler(async (req, res, next) => {

    console.log('=== UPDATE PRODUCT DEBUG ===');
    console.log('Product ID:', req.params.id);
    console.log('Request Body Keys:', Object.keys(req.body));
    console.log('Request Body:', JSON.stringify(req.body, null, 2));

    let product = await Product.findById(req.params.id);

    if (!product) {
        return next(new ErrorHandler("Product Not Found", 404));
    }

    if (!isOwnerOrAdmin(req, product)) {
        return next(new ErrorHandler("You are not allowed to update this product", 403));
    }

    // Tracks whether this update moved the price, so unmatched investments can
    // be repriced/refunded after the product is saved (see the end of this
    // handler). Captured before the save because that's the only point the old
    // price is still readable.
    const priceBeforeUpdate = product.price;

    if (req.user.role === 'vendor') {
        // Vendors own their listing price and catalog info, never the derived
        // vendor/investor numbers or the publish status. Re-deriving on every
        // price change is mandatory, not optional — a stale vendorPrice would
        // pay them the wrong amount on the next sale.
        stripAdminOnlyFields(req.body);

        if (await applyListingPrice(req.body, product)) {
            req.body.pricingStatus = 'priced';
            // Still awaiting first approval, or vendor is resubmitting after a
            // rejection — send it back into the approval queue rather than
            // publishing it directly. Never touches an already-live/paused listing.
            if (['draft', 'pending_approval', 'rejected'].includes(product.listingStatus)) {
                req.body.listingStatus = 'pending_approval';
                req.body.rejectionNote = null;
            }
        }
    } else {
        // Admin editing a product's price through the normal edit
        // form rather than the pricing panel — derive just the same.
        if (req.body.price !== undefined) {
            await applyListingPrice(req.body, product);
        }
    }

    if (req.body.images !== undefined) {
        let images = [];
        if (typeof req.body.images === "string") {
            images.push(req.body.images);
        } else if (Array.isArray(req.body.images)) {
            images = req.body.images;
        }

        if (images && images.length > 0) {
            // Keep existing images and append new ones
            const imagesLink = [...(product.images || [])];

            for (let i = 0; i < images.length; i++) {
                const result = await cloudinary.v2.uploader.upload(images[i], {
                    folder: "products",
                });

                imagesLink.push({
                    public_id: result.public_id,
                    url: result.secure_url,
                    isFeatured: false,
                });
            }
            req.body.images = imagesLink;
        } else {
            // An edit that adds no new images sends an empty array. Without
            // this the key would survive into findByIdAndUpdate and wipe every
            // existing image off the product.
            delete req.body.images;
        }
    }

    // FIX: Handle featured image index update (when user changes featured image without uploading new ones)
    if (req.body.featuredImageIndex !== undefined && product.images && product.images.length > 0) {
        const featuredIndex = parseInt(req.body.featuredImageIndex);
        if (featuredIndex >= 0 && featuredIndex < product.images.length) {
            // Update all images to set only the selected one as featured
            product.images.forEach((img, index) => {
                img.isFeatured = index === featuredIndex;
            });
            // Mark the images field as modified so Mongoose saves it
            product.markModified('images');
            await product.save();
        }
        // Remove featuredImageIndex from req.body so it doesn't get saved as a field
        delete req.body.featuredImageIndex;
    }

    // Handle brand logo update
    if (req.body.logo && req.body.logo.length > 0) {
        // Delete old logo if exists
        if (product.brand && product.brand.logo && product.brand.logo.public_id) {
            await cloudinary.v2.uploader.destroy(product.brand.logo.public_id);
        }

        const result = await cloudinary.v2.uploader.upload(req.body.logo, {
            folder: "brands",
        });
        const brandLogo = {
            public_id: result.public_id,
            url: result.secure_url,
        };

        req.body.brand = {
            name: req.body.brandname,
            logo: brandLogo
        };
    } else if (req.body.brandname) {
        // Update brand name only if logo not provided
        req.body.brand = {
            name: req.body.brandname,
            logo: product.brand?.logo // Keep existing logo
        };
    }

    if (req.body.specifications && Array.isArray(req.body.specifications) && req.body.specifications.length > 0) {
        let specs = [];
        req.body.specifications.forEach((s) => {
            if (typeof s === 'string') {
                specs.push(JSON.parse(s));
            } else {
                specs.push(s);
            }
        });
        req.body.specifications = specs;
    }

    // Handle care instructions
    if (req.body.careInstructions && Array.isArray(req.body.careInstructions)) {
        req.body.careInstructions = req.body.careInstructions.map(c =>
            typeof c === 'string' ? JSON.parse(c) : c
        );
    }

    // Handle tags (if it's a string, convert to array)
    if (req.body.tags && typeof req.body.tags === 'string') {
        req.body.tags = JSON.parse(req.body.tags);
    }

    // Handle variants with images
    if (req.body.variants && typeof req.body.variants === 'string') {
        const variants = JSON.parse(req.body.variants);

        // Process variant images
        const processedVariants = [];
        for (const variant of variants) {
            const variantData = { ...variant };

            // Upload variant images if they exist and are base64 strings (new uploads)
            if (variant.images && Array.isArray(variant.images) && variant.images.length > 0) {
                const variantImagesLink = [];

                for (let i = 0; i < variant.images.length; i++) {
                    const image = variant.images[i];

                    // Check if this is a new base64 image upload or an existing URL
                    if (typeof image === 'string' && image.startsWith('data:')) {
                        // New image - upload to Cloudinary
                        const result = await cloudinary.v2.uploader.upload(image, {
                            folder: "products/variants",
                        });

                        variantImagesLink.push({
                            public_id: result.public_id,
                            url: result.secure_url,
                            isFeatured: i === (variant.featuredImageIndex || 0)
                        });
                    } else if (typeof image === 'string' && image.startsWith('http')) {
                        // Existing image URL - keep as is
                        // Find the existing image from the product to preserve public_id
                        const existingVariant = product.variants?.find(v =>
                            v.productId === variant.productId ||
                            (v.color === variant.color && v.size === variant.size)
                        );
                        const existingImage = existingVariant?.images?.find(img => img.url === image);

                        if (existingImage) {
                            variantImagesLink.push({
                                public_id: existingImage.public_id,
                                url: existingImage.url,
                                isFeatured: i === (variant.featuredImageIndex || 0)
                            });
                        }
                    }
                }

                variantData.images = variantImagesLink;
                delete variantData.featuredImageIndex; // Remove this as we use isFeatured instead
            }

            // stripAdminOnlyFields only reaches top-level keys, and a
            // per-variant price would break the margin math: checkout charges
            // variant.price while settlement still pays the investor
            // product.price. Vendor variants inherit the product price.
            if (req.user.role === 'vendor') {
                delete variantData.price;
                delete variantData.cuttedPrice;
            }

            processedVariants.push(variantData);
        }

        req.body.variants = processedVariants;
    }

    // Don't overwrite the original creator/vendor on update.
    delete req.body.user;

    console.log('=== ABOUT TO UPDATE ===');
    console.log('Update Data:', JSON.stringify(req.body, null, 2));

    product = await Product.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
        useFindAndModify: false,
    });

    console.log('=== UPDATED PRODUCT ===');
    console.log('Updated Product Name:', product.name);
    console.log('Updated Product Description:', product.description?.substring(0, 100));
    console.log('Updated Product Price:', product.price);

    // The price moved, so anyone holding an unfunded unit of this product at
    // the old price is now over-invested — refund them the difference.
    let refunds = [];
    if (product.price !== priceBeforeUpdate) {
        refunds = await repriceInvestments(product);
    }

    res.status(201).json({
        success: true,
        product,
        refunds,
    });
});

// Override a product's listing price, margin, and investable units ---ADMIN
//
// Two settable numbers: the listing price, and optionally a margin that
// applies to this product alone instead of the global one. The vendor's net
// and the investor's terms are always derived from those two (see
// utils/pricingCalculator.js) and are never typed in, which is why this does
// not take investorPrice/investorPayout.
// Phase 21 — applies an admin-submitted return policy to a product.
//
// Shared by the pricing endpoint and the approval endpoint, because admin can
// set these at either moment and the two must not drift. Tri-state per field,
// the same convention marginPct and investableUnits already use: a value sets
// it, explicit null clears it back to the platform default, omitting the key
// leaves whatever is stored alone.
//
// Returns an error message, or null once the product has been updated.
function applyReturnPolicy(product, body) {
    const { returnPolicy, returnWindowDays } = body;
    if (returnPolicy === undefined && returnWindowDays === undefined) return null;

    // Validated against the pair that will END UP stored, not just the fields
    // in this request — otherwise setting policy 'none' on a product that
    // already has a 7-day window would store a contradiction neither half of
    // the request looks wrong on its own.
    const merged = {
        returnPolicy: returnPolicy !== undefined ? returnPolicy : product.returnPolicy,
        returnWindowDays:
            returnWindowDays !== undefined ? returnWindowDays : product.returnWindowDays,
    };

    const error = returnPolicyError(merged);
    if (error) return error;

    if (returnPolicy !== undefined) {
        product.returnPolicy =
            returnPolicy === null || returnPolicy === '' ? null : returnPolicy;
    }
    if (returnWindowDays !== undefined) {
        product.returnWindowDays =
            returnWindowDays === null || returnWindowDays === '' ? null : Number(returnWindowDays);
    }

    // A policy that cannot refund has no window. Normalised on write so no
    // reader has to remember to ignore a stored number that can never apply.
    if (product.returnPolicy === 'none' || product.returnPolicy === 'replacement_only') {
        product.returnWindowDays = 0;
    }

    return null;
}

// The resolved return rules for a payload, plus the sentence a UI can print.
// Resolved (never null) so nothing client-side has to re-implement the
// product-then-default fallback.
function returnInfo(product, settings) {
    const policy = resolveReturnPolicy(product, settings);
    return {
        returnPolicy: policy.policy,
        returnWindowDays: policy.windowDays,
        returnPolicyLabel: describeReturnPolicy(policy),
        usesDefaultReturnPolicy:
            product.returnPolicy == null && product.returnWindowDays == null,
    };
}

exports.updateProductPricing = asyncErrorHandler(async (req, res, next) => {

    const product = await Product.findById(req.params.id);

    if (!product) {
        return next(new ErrorHandler("Product Not Found", 404));
    }

    const { price, investableUnits, marginPct, marginBands, marginCategory } = req.body;

    if (price === undefined || price === null || Number(price) <= 0) {
        return next(new ErrorHandler("Customer price is required", 400));
    }

    // marginPct is tri-state: a number sets a per-product override, explicit
    // null clears it back to the global margin, and omitting the key leaves
    // whatever is already stored alone.
    if (marginPct !== undefined) {
        if (marginPct === null || marginPct === '') {
            product.marginPct = null;
        } else if (Number.isNaN(Number(marginPct)) || Number(marginPct) < 0) {
            return next(new ErrorHandler("Margin must be a positive number", 400));
        } else {
            product.marginPct = Number(marginPct);
        }
    }

    // What investors are repriced against. Watched rather than `price` because
    // the margin override can move investorPrice while `price` stays put, and
    // an unmatched investor who paid the old, higher investorPrice is owed the
    // difference either way.
    const investorPriceBeforeUpdate = product.investorPrice;

    const settings = await PlatformSettings.getSingleton();
    const effectiveMarginPct = resolveMarginPct(product, settings);

    // Margin bands are validated against the margin that ACTUALLY applies
    // (resolved just above, including any override arriving in this same
    // request), because the investor's return is paid out of it. Done before
    // anything is written, so a rejected band leaves nothing half-saved.
    if (marginBands !== undefined) {
        const bandError = bandsError(marginBands, effectiveMarginPct);
        if (bandError) {
            return next(new ErrorHandler(bandError, 400));
        }
        product.marginBands = normaliseBands(marginBands);
    }

    if (marginCategory !== undefined) {
        if (marginCategory === null || marginCategory === '') {
            product.marginCategory = null;
        } else if (!BAND_KEYS.includes(marginCategory)) {
            return next(new ErrorHandler(
                `Margin category must be one of ${BAND_KEYS.join(', ')}`, 400
            ));
        } else {
            product.marginCategory = marginCategory;
        }
    }

    // Phase 21 — how long this product's money is held after delivery. Applied
    // before anything is written, so a rejected policy leaves nothing
    // half-saved, same as the bands above.
    const policyError = applyReturnPolicy(product, req.body);
    if (policyError) {
        return next(new ErrorHandler(policyError, 400));
    }

    const derived = calculateGlobalPricing(Number(price), { marginPct: effectiveMarginPct });
    product.price = derived.price;
    product.vendorPrice = derived.vendorPrice;
    product.investorPrice = derived.investorPrice;
    // The forecast only. What an investor is actually paid is computed at
    // settlement from the days their own unit was held, against the bands
    // snapshotted when they invested.
    const bands = resolveBands(product, settings);
    product.investorPayout = forecastPayout(
        derived.investorPrice,
        bands,
        product.marginCategory
    );

    // Tri-state, same as marginPct: a number caps investable units, explicit
    // null (or an empty field) clears the cap so it follows stock again, and
    // omitting the key leaves the stored value alone.
    if (investableUnits !== undefined) {
        product.investableUnits =
            investableUnits === null || investableUnits === '' ? null : Number(investableUnits);
    }
    product.pricingStatus = 'priced';

    await product.save({ validateBeforeSave: false });

    // A lower investorPrice means unmatched investors overpaid — refund them.
    const refunds = product.investorPrice !== investorPriceBeforeUpdate
        ? await repriceInvestments(product)
        : [];

    const resolveProductBands = await buildBandResolver([product], settings);

    res.status(200).json({
        success: true,
        product,
        refunds,
        effectiveMarginPct,
        marginSource: product.marginPct != null ? 'product' : 'global',
        ...resolveProductBands(product),
        usesDefaultBands: !isCompleteBands(product.marginBands),
        ...returnInfo(product, settings),
    });
});

// Phase 16/17 had an "Apply margin categories" bulk action here, which pushed
// every product's current tier percentage into its price and refunded the
// investors that affected. Phase 20 deleted it: a band is no longer the margin,
// so a band moving cannot move a price and there is nothing to re-apply. The
// only thing that still reprices investors is a change to the product's price
// or margin, handled in updateProductPricing above.

// Approve/reject/pause a listing ---ADMIN
//
// A listing can only go 'live' once admin has set pricing. Since Phase 20 this
// is also where admin sets the product's margin bands and its starting band —
// approving a vendor's listing is exactly the moment they decide what an
// investor earns on it. Both are optional: leaving them out means the product
// uses settings.defaultMarginBands, which the approval UI shows explicitly so
// admin can see what they are accepting.
exports.updateListingStatus = asyncErrorHandler(async (req, res, next) => {

    const product = await Product.findById(req.params.id);

    if (!product) {
        return next(new ErrorHandler("Product Not Found", 404));
    }

    const { listingStatus, rejectionNote, marginBands, marginCategory } = req.body;
    const validStatuses = ['draft', 'pending_approval', 'live', 'rejected', 'paused'];

    if (!validStatuses.includes(listingStatus)) {
        return next(new ErrorHandler("Invalid listing status", 400));
    }

    if (listingStatus === 'live' && product.pricingStatus !== 'priced') {
        return next(new ErrorHandler("Set customer pricing before publishing this listing", 400));
    }

    const settings = await PlatformSettings.getSingleton();

    // Validated against the margin that actually applies to this product — the
    // investor's return is paid out of it, so a band above it would have the
    // platform funding returns out of pocket.
    if (marginBands !== undefined) {
        const bandError = bandsError(marginBands, resolveMarginPct(product, settings));
        if (bandError) {
            return next(new ErrorHandler(bandError, 400));
        }
        product.marginBands = normaliseBands(marginBands);
    }

    if (marginCategory !== undefined) {
        if (marginCategory === null || marginCategory === '') {
            product.marginCategory = null;
        } else if (!BAND_KEYS.includes(marginCategory)) {
            return next(new ErrorHandler(
                `Margin category must be one of ${BAND_KEYS.join(', ')}`, 400
            ));
        } else {
            product.marginCategory = marginCategory;
        }
    }

    // Phase 21 — approval is also where admin sets the return rules, since
    // approving a listing is exactly the moment they decide how long its money
    // is held. Left out means the product uses the platform default (7-day
    // full return), which the approval UI shows explicitly.
    const policyError = applyReturnPolicy(product, req.body);
    if (policyError) {
        return next(new ErrorHandler(policyError, 400));
    }

    product.listingStatus = listingStatus;
    // The band clock starts the first time a listing is published, and never
    // restarts. Deliberately not `createdAt`: a vendor's listing can sit in
    // pending_approval for days, and charging the product for admin's review
    // delay would drift genuinely fast listings into a slower band.
    if (listingStatus === 'live' && !product.liveAt) {
        product.liveAt = new Date();
    }
    // Rejection note only makes sense attached to a rejection — clear it the
    // moment the status moves anywhere else so it can't linger stale.
    product.rejectionNote = listingStatus === 'rejected' ? (rejectionNote || null) : null;

    // Bands may have moved, and investorPayout is the forecast quoted against
    // them. Re-derived rather than left stale so the listing never advertises a
    // return the current rules would not pay.
    if (product.investorPrice != null) {
        product.investorPayout = forecastPayout(
            product.investorPrice,
            resolveBands(product, settings),
            product.marginCategory
        );
    }

    await product.save({ validateBeforeSave: false });

    const resolveProductBands = await buildBandResolver([product], settings);

    res.status(200).json({
        success: true,
        message: `Listing status updated to ${listingStatus}`,
        product: {
            ...product.toObject(),
            ...resolveProductBands(product),
            usesDefaultBands: !isCompleteBands(product.marginBands),
            ...returnInfo(product, settings),
        },
    });
});

// Delete Product ---ADMIN
exports.deleteProduct = asyncErrorHandler(async (req, res, next) => {

    const product = await Product.findById(req.params.id);

    if (!product) {
        return next(new ErrorHandler("Product Not Found", 404));
    }

    if (!isOwnerOrAdmin(req, product)) {
        return next(new ErrorHandler("You are not allowed to delete this product", 403));
    }

    for (let i = 0; i < product.images.length; i++) {
        await cloudinary.v2.uploader.destroy(product.images[i].public_id);
    }

    await product.remove();

    res.status(201).json({
        success: true
    });
});

// Create OR Update Reviews
exports.createProductReview = asyncErrorHandler(async (req, res, next) => {

    // ── Phase 23: only buyers may review ──
    //
    // This was open to any signed-in user, for any product, with no purchase
    // required — straightforward ratings manipulation, by a competitor or by a
    // vendor on their own listing.
    //
    // Keyed on DELIVERY rather than on having placed an order, so a review
    // cannot be written from an order that was cancelled before it shipped.
    const { rating, comment, productId } = req.body;

    const purchased = await Order.findOne({
        user: req.user._id,
        orderStatus: { $in: ['Delivered', 'Replaced', 'Returned'] },
        'orderItems.product': productId,
    }).select('_id');

    if (!purchased) {
        return next(new ErrorHandler(
            "You can only review a product you have bought and received",
            403
        ));
    }

    const review = {
        user: req.user._id,
        name: req.user.name,
        rating: Number(rating),
        comment,
    }

    const product = await Product.findById(productId);

    if (!product) {
        return next(new ErrorHandler("Product Not Found", 404));
    }

    const isReviewed = product.reviews.find(review => review.user.toString() === req.user._id.toString());

    if (isReviewed) {

        product.reviews.forEach((rev) => {
            if (rev.user.toString() === req.user._id.toString())
                (rev.rating = rating, rev.comment = comment);
        });
    } else {
        product.reviews.push(review);
        product.numOfReviews = product.reviews.length;
    }

    let avg = 0;

    product.reviews.forEach((rev) => {
        avg += rev.rating;
    });

    product.ratings = avg / product.reviews.length;

    await product.save({ validateBeforeSave: false });

    res.status(200).json({
        success: true
    });
});

// Get All Reviews of Product
exports.getProductReviews = asyncErrorHandler(async (req, res, next) => {

    const product = await Product.findById(req.query.id);

    if (!product) {
        return next(new ErrorHandler("Product Not Found", 404));
    }

    res.status(200).json({
        success: true,
        reviews: product.reviews
    });
});

// Delete Reveiws
exports.deleteReview = asyncErrorHandler(async (req, res, next) => {

    const product = await Product.findById(req.query.productId);

    if (!product) {
        return next(new ErrorHandler("Product Not Found", 404));
    }

    const reviews = product.reviews.filter((rev) => rev._id.toString() !== req.query.id.toString());

    let avg = 0;

    reviews.forEach((rev) => {
        avg += rev.rating;
    });

    let ratings = 0;

    if (reviews.length === 0) {
        ratings = 0;
    } else {
        ratings = avg / reviews.length;
    }

    const numOfReviews = reviews.length;

    await Product.findByIdAndUpdate(req.query.productId, {
        reviews,
        ratings: Number(ratings),
        numOfReviews,
    }, {
        new: true,
        runValidators: true,
        useFindAndModify: false,
    });

    res.status(200).json({
        success: true,
    });
});