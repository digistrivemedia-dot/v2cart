const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Please Enter Your Name"],
    },
    email: {
        type: String,
        required: [true, "Please Enter Your Email"],
        unique: true,
        validate: [validator.isEmail, "Please Enter a Valid Email"],
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other']
    },
    password: {
        type: String,
        required: [true, "Please Enter Your Password"],
        minLength: [8, "Password should have atleast 8 chars"],
        select: false,
    },
    avatar: {
        public_id: {
            type: String,
        },
        url: {
            type: String,
        }
    },

    // Role-based access control. Four roles only: 'user' is the customer, and
    // 'admin' is the app owner — there is no tier above it. A 'superadmin'
    // role existed until 2026-10-26 and held the pricing/onboarding/report
    // controls; it was removed because the owner IS the admin, and splitting
    // the two only locked the owner out of their own margin settings.
    role: {
        type: String,
        enum: ['user', 'vendor', 'investor', 'admin'],
        default: "user",
    },

    // Vendor onboarding + payout details (only relevant when role === 'vendor')
    vendorProfile: {
        businessName: String,
        gstNumber: String,
        payoutDetails: {
            accountName: String,
            accountNumber: String,
            ifsc: String,
            upiId: String,
        },
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
    },

    // Investor onboarding + payout details (only relevant when role === 'investor')
    investorProfile: {
        payoutDetails: {
            accountName: String,
            accountNumber: String,
            ifsc: String,
            upiId: String,
        },
        // RazorpayX contact + fund account, created once and reused across
        // withdrawals. `fingerprint` is a hash of the payout details it was
        // built from, so editing a bank account rebuilds it instead of paying
        // into the old one.
        payoutAccount: {
            contactId: String,
            fundAccountId: String,
            accountType: String,
            fingerprint: String,
        },
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
    },

    // Phase 23 — brute-force protection on /login.
    //
    // Stored on the USER rather than held in process memory, because the
    // backend runs on Vercel serverless: an in-memory counter (which is what
    // express-rate-limit's default store is) resets on every cold start and is
    // not shared between concurrent instances, so it would be close to no
    // protection at all. A counter on the document is shared by construction.
    loginAttempts: {
        type: Number,
        default: 0,
        select: false,
    },
    lockUntil: {
        type: Date,
        default: null,
        select: false,
    },

    // Cart - stores product references with quantity and variant info
    cart: [
        {
            product: {
                type: mongoose.Schema.ObjectId,
                ref: "Product",
                required: true
            },
            name: String,
            price: Number,
            quantity: {
                type: Number,
                required: true,
                default: 1,
                min: [1, "Quantity cannot be less than 1"]
            },
            image: String,
            // For variant selection (color, size, etc.)
            variant: {
                color: String,
                size: String,
            },
            addedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    // Wishlist - stores product references
    wishlist: [
        {
            product: {
                type: mongoose.Schema.ObjectId,
                ref: "Product",
                required: true
            },
            addedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    // Multiple addresses for delivery
    addresses: [
        {
            name: {
                type: String,
                required: true
            },
            phoneNo: {
                type: Number,
                required: true,
                minLength: [10, "Phone Number should have 10 digits"]
            },
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
                required: true,
                default: "India"
            },
            pincode: {
                type: Number,
                required: true,
                minLength: [6, "Pincode should have 6 digits"]
            },
            addressType: {
                type: String,
                enum: ['home', 'work', 'other'],
                default: 'home'
            },
            isDefault: {
                type: Boolean,
                default: false
            }
        }
    ],

    // Recently viewed products
    recentlyViewed: [
        {
            product: {
                type: mongoose.Schema.ObjectId,
                ref: "Product"
            },
            viewedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    createdAt: {
        type: Date,
        default: Date.now,
    },

    resetPasswordToken: String,
    resetPasswordExpire: Date,
});

userSchema.pre("save", async function (next) {

    if (!this.isModified("password")) {
        next();
    }

    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.getJWTToken = function () {
    return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE
    });
}

userSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
}

userSchema.methods.getResetPasswordToken = async function () {

    // generate token
    const resetToken = crypto.randomBytes(20).toString("hex");

    // generate hash token and add to db
    this.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

    return resetToken;
}

module.exports = mongoose.model('User', userSchema);