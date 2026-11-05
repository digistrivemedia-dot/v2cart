/**
 * Self-check for cart line identity.
 *
 * The product card looks its quantity up by key. If the key it builds ever
 * stops matching the key the store builds from a server response, the counter
 * silently reads zero and every tap adds a duplicate — which is the class of
 * bug the stepper was introduced to kill.
 *
 * Run with: node src/utils/cartline.check.mjs
 */
import assert from 'node:assert';

// Mirrors src/store/cartStore.js. Imported there rather than copied in the
// app; duplicated here only because the store imports React Native.
const cartLineKey = (productId, variant) =>
  `${productId}::${variant?.color ?? ''}::${variant?.size ?? ''}`;

/** How the store derives a line's key from a server cart row. */
const keyFromServerLine = (line) =>
  cartLineKey(
    line.productId,
    line.variant?.color || line.variant?.size
      ? { color: line.variant.color, size: line.variant.size }
      : null
  );

const ID = '6aa92c42d0ef708b561c0b30';

// --- The card's key must match the server's, for a plain product ----------
// The backend always sends a `variant` object, with the fields absent when
// the line has no variant — that must not produce a different key from the
// card's `cartLineKey(id, null)`.
for (const [label, variant] of [
  ['variant omitted', undefined],
  ['variant null', null],
  ['empty object', {}],
  ['explicit undefined fields', { color: undefined, size: undefined }],
  ['explicit null fields', { color: null, size: null }],
  ['empty strings', { color: '', size: '' }],
]) {
  assert.strictEqual(
    keyFromServerLine({ productId: ID, variant }),
    cartLineKey(ID, null),
    `card and store disagree when the server sends: ${label}`
  );
}

// --- A real variant is its own line, not the plain one --------------------
assert.notStrictEqual(
  keyFromServerLine({ productId: ID, variant: { size: '12x12' } }),
  cartLineKey(ID, null),
  'a sized line must not collide with the plain line'
);
assert.strictEqual(
  keyFromServerLine({ productId: ID, variant: { size: '12x12' } }),
  cartLineKey(ID, { size: '12x12' }),
  'the same variant yields the same key either way'
);
assert.notStrictEqual(
  cartLineKey(ID, { color: 'Blue', size: '12x12' }),
  cartLineKey(ID, { color: 'Red', size: '12x12' }),
  'colour distinguishes lines'
);

// --- Different products never share a line -------------------------------
assert.notStrictEqual(cartLineKey('a', null), cartLineKey('b', null));

// --- Ids are compared as strings (Mongo ids arrive as strings) ------------
assert.strictEqual(cartLineKey(ID, null), cartLineKey(String(ID), null));

console.log('cart line: all checks passed');
