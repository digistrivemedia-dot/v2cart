/**
 * Cart + wishlist + address self-check.
 *
 * The cart lives on the user document so that the website and the mobile app
 * share one basket. That only holds if the HTTP surface behaves, so this
 * drives the real endpoints rather than unit-testing helpers.
 *
 *   node scripts/cart.check.js            (backend on :4000)
 *   API=http://host/api/v1 node scripts/cart.check.js
 *
 * Creates one throwaway user. Needs at least one live product in the catalogue.
 */
const assert = require('assert');

const API = process.env.API || 'http://localhost:4000/api/v1';

async function call(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
}

/** Lines as [size, quantity] pairs, so assertions read like the UI. */
const lines = (cart) => cart.map((i) => [i.size, i.quantity]);

(async () => {
    const { data: products } = await call('/products?limit=1');
    assert(products.products?.length, 'need at least one live product to check the cart');
    const productId = products.products[0]._id;
    const stock = Number(products.products[0].stock);

    const email = `cart-check-${Date.now()}@example.invalid`;
    const { data: auth } = await call('/register', {
        method: 'POST',
        body: { name: 'Cart Check', email, password: 'password123' },
    });
    assert(auth.token, `register failed: ${auth.message}`);
    const token = auth.token;

    // No gender is sent on purpose: the app doesn't collect one, and a
    // required gender used to make every signup a 500.
    assert(!auth.user.password, 'register must not echo the password hash');

    const unauth = await call('/cart');
    assert.strictEqual(unauth.status, 401, 'the cart must require a session');

    let { data } = await call('/cart', { token });
    assert.deepStrictEqual(data.cart, [], 'a new user starts with an empty cart');

    ({ data } = await call('/cart', {
        method: 'POST',
        token,
        body: { product: productId, quantity: 2, variant: { size: '12x12' } },
    }));
    assert.deepStrictEqual(lines(data.cart), [['12x12', 2]]);

    // Same product + same variant is the same line, not a second one.
    ({ data } = await call('/cart', {
        method: 'POST',
        token,
        body: { productId, quantity: 1, variant: { size: '12x12' } },
    }));
    assert.deepStrictEqual(lines(data.cart), [['12x12', 3]]);

    // A different variant is its own line.
    ({ data } = await call('/cart', {
        method: 'POST',
        token,
        body: { product: productId, quantity: 1, variant: { size: '24x24' } },
    }));
    assert.deepStrictEqual(lines(data.cart), [['12x12', 3], ['24x24', 1]]);
    assert.strictEqual(data.count, 4, 'count is the sum of quantities');

    const itemId = data.cart[0].id;

    // Quantity is capped at stock, never above it.
    ({ data } = await call(`/cart/${itemId}`, {
        method: 'PUT',
        token,
        body: { quantity: stock + 50 },
    }));
    assert.strictEqual(data.cart.find((i) => i.id === itemId).quantity, stock,
        'quantity must be capped at available stock');

    // Zero means remove — the web decrements to zero instead of deleting.
    ({ data } = await call(`/cart/${itemId}`, { method: 'PUT', token, body: { quantity: 0 } }));
    assert.deepStrictEqual(lines(data.cart), [['24x24', 1]]);

    // A guest basket merges in rather than replacing what's there.
    ({ data } = await call('/cart/merge', {
        method: 'POST',
        token,
        body: {
            items: [
                { product: productId, quantity: 2, variant: { size: '24x24' } },
                { product: productId, quantity: 1, variant: { size: '6x6' } },
                { product: '0'.repeat(24), quantity: 1 }, // unknown: skipped, not fatal
            ],
        },
    }));
    assert.deepStrictEqual(lines(data.cart), [['24x24', 3], ['6x6', 1]]);

    const line = data.cart[0];
    for (const field of ['id', 'productId', 'name', 'price', 'quantity', 'size']) {
        assert(line[field] !== undefined, `cart line is missing ${field}`);
    }

    const missing = await call('/cart', { method: 'POST', token, body: { product: '0'.repeat(24) } });
    assert.strictEqual(missing.status, 404, 'adding a nonexistent product is a 404, not a 500');

    const invalid = await call('/register', {
        method: 'POST',
        body: { name: 'x', email: 'not-an-email', password: 'short' },
    });
    assert.strictEqual(invalid.status, 400, 'validation errors are 400, not 500');

    ({ data } = await call('/cart', { method: 'DELETE', token }));
    assert.deepStrictEqual(data.cart, [], 'clear empties the cart');

    /* ----------------------------- wishlist ------------------------------ */

    ({ data } = await call('/wishlist', { token }));
    assert.deepStrictEqual(data.productIds, [], 'a new user has an empty wishlist');

    ({ data } = await call('/wishlist', { method: 'POST', token, body: { product: productId } }));
    assert.deepStrictEqual(data.productIds, [productId]);
    assert.strictEqual(data.wishlist[0].name, products.products[0].name, 'rows carry the product');

    // Saving twice is the same as saving once — a double tap must not
    // create a second row.
    ({ data } = await call('/wishlist', { method: 'POST', token, body: { productId } }));
    assert.strictEqual(data.count, 1, 'adding twice is idempotent');

    // Removal is keyed by product id, because the caller is a heart on a
    // card: it knows the product, not the wishlist row holding it.
    ({ data } = await call(`/wishlist/${productId}`, { method: 'DELETE', token }));
    assert.strictEqual(data.count, 0);

    const gone = await call(`/wishlist/${productId}`, { method: 'DELETE', token });
    assert.strictEqual(gone.status, 404, 'removing what is not saved is a 404, not a 500');

    ({ data } = await call('/wishlist/merge', {
        method: 'POST',
        token,
        body: { productIds: [productId, productId, '0'.repeat(24)] },
    }));
    assert.strictEqual(data.count, 1, 'merge collapses duplicates and skips unknown products');

    const unauthWishlist = await call('/wishlist');
    assert.strictEqual(unauthWishlist.status, 401, 'the wishlist requires a session');

    const badSave = await call('/wishlist', { method: 'POST', token, body: { product: '0'.repeat(24) } });
    assert.strictEqual(badSave.status, 404, 'saving a nonexistent product is a 404');

    ({ data } = await call('/wishlist', { method: 'DELETE', token }));
    assert.strictEqual(data.count, 0, 'clear empties the wishlist');

    /* ----------------------------- addresses ----------------------------- */

    const base = {
        name: 'Home',
        phoneNo: 9876543210,
        address: '12 MG Road',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: 411001,
        addressType: 'home',
    };

    ({ data } = await call('/me/addresses/new', { method: 'POST', token, body: base }));
    assert.strictEqual(data.addresses.length, 1);
    assert.strictEqual(data.addresses[0].isDefault, true, 'the first address becomes the default');
    assert.strictEqual(data.addresses[0].country, 'India', 'country defaults');
    const addressId = data.addresses[0]._id;

    // A partial edit must leave every untouched field alone.
    //
    // This used to replace the subdocument with `{ ...subdoc, ...fields }`.
    // Spreading a Mongoose subdocument copies none of its data, so omitted
    // fields became `undefined` and the save failed on required paths —
    // editing one field was impossible.
    ({ data } = await call(`/me/addresses/${addressId}`, {
        method: 'PUT',
        token,
        body: { city: 'Thane' },
    }));
    const edited = data.addresses[0];
    assert.strictEqual(edited.city, 'Thane', 'the edited field changed');
    for (const field of ['name', 'address', 'state', 'pincode', 'addressType']) {
        assert.strictEqual(
            String(edited[field]),
            String(base[field]),
            `a partial edit wiped ${field}`
        );
    }
    assert.strictEqual(edited.isDefault, true, 'a partial edit kept the default flag');

    // A second address does not steal the default.
    ({ data } = await call('/me/addresses/new', {
        method: 'POST',
        token,
        body: { ...base, name: 'Work', city: 'Mumbai', pincode: 400001, addressType: 'work' },
    }));
    assert.strictEqual(data.addresses.length, 2);
    assert.strictEqual(data.addresses[1].isDefault, false, 'a later address is not default by default');
    const secondId = data.addresses[1]._id;

    // Promoting one demotes the other — exactly one default at a time.
    ({ data } = await call(`/me/addresses/${secondId}/default`, { method: 'PUT', token }));
    assert.deepStrictEqual(
        data.addresses.map((a) => a.isDefault),
        [false, true],
        'exactly one address is default'
    );

    const badAddress = await call('/me/addresses/000000000000000000000000', {
        method: 'PUT',
        token,
        body: { city: 'X' },
    });
    assert.strictEqual(badAddress.status, 404, 'editing an unknown address is a 404');

    const unauthAddress = await call('/me/addresses/new', { method: 'POST', body: base });
    assert.strictEqual(unauthAddress.status, 401, 'addresses require a session');

    ({ data } = await call(`/me/addresses/${secondId}`, { method: 'DELETE', token }));
    assert.strictEqual(data.addresses.length, 1, 'delete removes exactly one');
    assert.strictEqual(data.addresses[0].name, 'Home');

    // The app reads addresses off /me, so they have to be there.
    const { data: me } = await call('/me', { token });
    assert.strictEqual(me.user.addresses.length, 1, '/me carries the addresses');
    assert(!me.user.password, '/me must not expose the password hash');

    console.log('cart + wishlist + addresses: all checks passed');
})().catch((err) => {
    console.error('check FAILED:', err.message);
    process.exit(1);
});
