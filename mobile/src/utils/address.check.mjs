/**
 * Self-check for delivery address rules.
 * Run with: node src/utils/address.check.mjs
 */
import assert from 'node:assert';
import {
  EMPTY_ADDRESS,
  validateAddress,
  toAddressPayload,
  addressKey,
  isSavedAlready,
  preferredAddress,
} from './address.js';

const GOOD = {
  name: 'Rohan',
  phoneNo: '9876543210',
  address: '12 MG Road',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
  addressType: 'home',
};

// --- A complete address is accepted -------------------------------------
assert.deepStrictEqual(validateAddress(GOOD), {}, 'a valid address must pass');

// --- An empty form reports every field, not just the first ---------------
{
  const errors = validateAddress(EMPTY_ADDRESS);
  assert.deepStrictEqual(
    Object.keys(errors).sort(),
    ['address', 'city', 'name', 'phoneNo', 'pincode', 'state'],
    'every missing field is reported at once'
  );
}

// --- Digit rules ---------------------------------------------------------
for (const phone of ['98765', '98765432100', '98765abcde', '', '          ']) {
  assert.ok(validateAddress({ ...GOOD, phoneNo: phone }).phoneNo, `phone "${phone}" must fail`);
}
for (const pin of ['41100', '4110011', 'abcdef', '']) {
  assert.ok(validateAddress({ ...GOOD, pincode: pin }).pincode, `pin "${pin}" must fail`);
}
// Numbers, not just strings — a saved address comes back from Mongo numeric.
assert.deepStrictEqual(
  validateAddress({ ...GOOD, phoneNo: 9876543210, pincode: 411001 }),
  {},
  'numeric phone/pin from the server must still validate'
);

// --- Whitespace-only is empty -------------------------------------------
assert.ok(validateAddress({ ...GOOD, name: '   ' }).name, 'a blank name must fail');
assert.ok(validateAddress({ ...GOOD, city: '  ' }).city, 'a blank city must fail');

// --- The payload matches what the backend's schema expects --------------
{
  const payload = toAddressPayload({ ...GOOD, name: '  Rohan  ', address: ' 12 MG Road ' });
  assert.strictEqual(payload.name, 'Rohan', 'trimmed');
  assert.strictEqual(payload.address, '12 MG Road', 'trimmed');
  assert.strictEqual(typeof payload.phoneNo, 'number', 'phoneNo is a Number in the schema');
  assert.strictEqual(typeof payload.pincode, 'number', 'pincode is a Number in the schema');
  assert.strictEqual(payload.phoneNo, 9876543210);
  assert.strictEqual(payload.pincode, 411001);
  assert.strictEqual(payload.addressType, 'home');
  // `country` is defaulted by the schema, so it is deliberately not sent.
  assert.deepStrictEqual(
    Object.keys(payload).sort(),
    ['address', 'addressType', 'city', 'name', 'phoneNo', 'pincode', 'state'],
    'no stray keys'
  );
  assert.strictEqual(toAddressPayload({ ...GOOD, addressType: '' }).addressType, 'home');
}

// --- De-duplication ------------------------------------------------------
{
  // Same place as saved by the server (numbers) vs typed in a form (strings).
  const savedCopy = {
    _id: 'a1',
    name: 'Home',
    phoneNo: 9876543210,
    address: '12 MG Road',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: 411001,
    addressType: 'home',
  };
  assert.strictEqual(addressKey(savedCopy), addressKey(GOOD), 'string and numeric forms match');
  assert.strictEqual(isSavedAlready([savedCopy], GOOD), true, 'the same place is a duplicate');

  // Case and padding don't make a new address.
  assert.strictEqual(
    isSavedAlready([savedCopy], { ...GOOD, city: '  PUNE ', address: '12 mg road' }),
    true,
    'case and whitespace are not a new address'
  );

  // A different label for the same place is still the same place.
  assert.strictEqual(
    isSavedAlready([savedCopy], { ...GOOD, name: "Mum's", addressType: 'other' }),
    true,
    'relabelling does not create a second address'
  );

  // A real change is a real new address.
  assert.strictEqual(isSavedAlready([savedCopy], { ...GOOD, pincode: '400001' }), false);
  assert.strictEqual(isSavedAlready([savedCopy], { ...GOOD, address: 'Tower B' }), false);
  assert.strictEqual(isSavedAlready([savedCopy], { ...GOOD, phoneNo: '9000000000' }), false);
  assert.strictEqual(isSavedAlready([], GOOD), false, 'nothing saved, nothing duplicated');
}

// --- Which address checkout pre-selects ---------------------------------
{
  const a = { _id: '1', isDefault: false };
  const b = { _id: '2', isDefault: true };
  assert.strictEqual(preferredAddress([a, b])._id, '2', 'the default wins');
  assert.strictEqual(preferredAddress([a])._id, '1', 'otherwise the first');
  assert.strictEqual(preferredAddress([]), null, 'nothing saved, nothing selected');
  assert.strictEqual(preferredAddress(), null, 'undefined is survivable');
}

console.log('address: all checks passed');
