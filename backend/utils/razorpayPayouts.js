const crypto = require('crypto');

/**
 * RazorpayX payouts — money OUT of the platform to an investor's bank.
 *
 * ── Why this isn't the `razorpay` SDK ──────────────────────────────────────
 *
 * The npm SDK (2.9.6) exposes `fundAccount` but neither `contacts` nor
 * `payouts`, so the X endpoints are called over REST here with the same basic
 * auth. One thin wrapper, so the rest of the codebase never builds a payout
 * request by hand.
 *
 * ── How a payout actually works ────────────────────────────────────────────
 *
 * Three objects, created once per investor and then reused:
 *
 *   1. CONTACT       the person being paid (name, email, phone)
 *   2. FUND ACCOUNT  where to pay them — a bank account (IFSC + number) or a
 *                    UPI VPA, attached to that contact
 *   3. PAYOUT        one transfer from the platform's RazorpayX balance to
 *                    that fund account
 *
 * A payout is asynchronous: it returns `queued`/`processing` and settles to
 * `processed`, `reversed` or `failed` minutes to hours later, depending on the
 * mode and the banking window. Nothing may treat the create call as success —
 * `verifyPayoutWebhook` + the webhook handler is what confirms money landed.
 *
 * ── Mock mode ──────────────────────────────────────────────────────────────
 *
 * PAYMENTS_MOCK=true (the same flag the payments mock uses) short-circuits all
 * three calls and returns a payout already in `processed`. That makes the
 * whole withdrawal flow testable with no RazorpayX account, no KYC and no
 * real balance — which matters because activating X is a separate onboarding
 * with its own approval queue.
 */

const X_BASE = 'https://api.razorpay.com/v1';

function isMocked() {
    return String(process.env.PAYMENTS_MOCK).toLowerCase() === 'true';
}

/**
 * X can use its own key pair. Falls back to the main Razorpay keys, which is
 * correct when X is enabled on the same account.
 */
function credentials() {
    const keyId = process.env.RAZORPAYX_KEY_ID || process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAYX_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error(
            'RazorpayX credentials not configured. Add RAZORPAYX_KEY_ID and '
            + 'RAZORPAYX_KEY_SECRET to config.env (or enable X on your existing '
            + 'RAZORPAY_* keys), or set PAYMENTS_MOCK=true to test without them.'
        );
    }

    return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

/** The platform's own X account number — the source of every payout. */
function sourceAccount() {
    const account = process.env.RAZORPAYX_ACCOUNT_NUMBER;
    if (!account) {
        throw new Error(
            'RAZORPAYX_ACCOUNT_NUMBER is not set. It is the account money is paid '
            + 'FROM — find it in the RazorpayX dashboard under Account Details.'
        );
    }
    return account;
}

async function call(path, { method = 'POST', body, idempotencyKey } = {}) {
    const response = await fetch(`${X_BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: credentials(),
            // X dedupes on this header, so a retried create can never pay
            // twice. Scoped per withdrawal id by the caller.
            ...(idempotencyKey ? { 'X-Payout-Idempotency': idempotencyKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data?.error?.description || `RazorpayX ${path} failed (${response.status})`;
        const err = new Error(message);
        err.statusCode = response.status;
        err.razorpay = data?.error;
        throw err;
    }

    return data;
}

/* --------------------------------- contact -------------------------------- */

async function createContact({ name, email, phone, referenceId }) {
    if (isMocked()) {
        return { id: `mock_cont_${crypto.randomBytes(5).toString('hex')}`, name, email };
    }

    return call('/contacts', {
        body: {
            name,
            email: email || undefined,
            contact: phone || undefined,
            type: 'customer',
            reference_id: referenceId,
        },
    });
}

/* ------------------------------- fund account ------------------------------ */

/**
 * Where to pay. A UPI id is preferred when present — it settles in seconds and
 * costs less than IMPS — with the bank account as the fallback.
 */
async function createFundAccount({ contactId, payoutDetails }) {
    const { accountName, accountNumber, ifsc, upiId } = payoutDetails || {};

    if (isMocked()) {
        return {
            id: `mock_fa_${crypto.randomBytes(5).toString('hex')}`,
            account_type: upiId ? 'vpa' : 'bank_account',
        };
    }

    if (upiId) {
        return call('/fund_accounts', {
            body: {
                contact_id: contactId,
                account_type: 'vpa',
                vpa: { address: upiId },
            },
        });
    }

    if (!accountNumber || !ifsc) {
        throw new Error(
            'No payout destination on file. Add a bank account (number + IFSC) or '
            + 'a UPI id to your investor profile before withdrawing.'
        );
    }

    return call('/fund_accounts', {
        body: {
            contact_id: contactId,
            account_type: 'bank_account',
            bank_account: {
                name: accountName,
                ifsc,
                account_number: accountNumber,
            },
        },
    });
}

/* --------------------------------- payout --------------------------------- */

/**
 * The mode X should use.
 *
 * UPI for VPA destinations. For bank accounts: IMPS clears within minutes and
 * is capped at ₹5,00,000, above which RTGS is the only option. NEFT is left
 * out deliberately — it batches and can sit for hours.
 */
function payoutMode(fundAccountType, amount) {
    if (fundAccountType === 'vpa') return 'UPI';
    return amount > 500000 ? 'RTGS' : 'IMPS';
}

async function createPayout({ fundAccountId, fundAccountType, amount, withdrawalId, narration }) {
    const amountInPaise = Math.round(amount * 100);

    if (isMocked()) {
        console.log(
            `[PAYMENTS_MOCK] Pretend payout of ₹${amount.toFixed(2)} to ${fundAccountId}`
        );
        return {
            id: `mock_pout_${crypto.randomBytes(6).toString('hex')}`,
            entity: 'payout',
            amount: amountInPaise,
            currency: 'INR',
            // Settled immediately so the flow completes end to end without a
            // webhook. Real payouts start queued and settle later.
            status: 'processed',
            mode: payoutMode(fundAccountType, amount),
            utr: `MOCKUTR${Date.now()}`,
        };
    }

    return call('/payouts', {
        // Keyed on the withdrawal, so a retry after a timeout cannot create a
        // second payout for the same request.
        idempotencyKey: String(withdrawalId),
        body: {
            account_number: sourceAccount(),
            fund_account_id: fundAccountId,
            amount: amountInPaise,
            currency: 'INR',
            mode: payoutMode(fundAccountType, amount),
            purpose: 'payout',
            queue_if_low_balance: true,
            narration: (narration || 'Investor withdrawal').slice(0, 30),
            reference_id: String(withdrawalId),
        },
    });
}

async function fetchPayout(payoutId) {
    if (isMocked()) {
        return { id: payoutId, status: 'processed', utr: `MOCKUTR${Date.now()}` };
    }
    return call(`/payouts/${payoutId}`, { method: 'GET' });
}

/* --------------------------------- webhook -------------------------------- */

/**
 * Validates a RazorpayX webhook signature.
 *
 * The secret is the one set when registering the webhook in the X dashboard —
 * NOT the API key secret. Without this check anyone could POST a
 * "payout.processed" and mark a withdrawal paid.
 */
function verifyPayoutWebhook(rawBody, signature) {
    const secret = process.env.RAZORPAYX_WEBHOOK_SECRET;

    if (!secret) {
        // Deliberately false rather than true: an unconfigured secret must
        // reject webhooks, not accept them all.
        console.error('RAZORPAYX_WEBHOOK_SECRET is not set — rejecting webhook');
        return false;
    }

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    // Length check first: timingSafeEqual throws on a mismatch.
    if (!signature || expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** X payout status -> our withdrawal status. */
const PAYOUT_STATUS = {
    queued: 'processing',
    pending: 'processing',
    processing: 'processing',
    processed: 'paid',
    cancelled: 'failed',
    rejected: 'failed',
    reversed: 'failed',
    failed: 'failed',
};

module.exports = {
    isMocked,
    createContact,
    createFundAccount,
    createPayout,
    fetchPayout,
    verifyPayoutWebhook,
    payoutMode,
    PAYOUT_STATUS,
};
