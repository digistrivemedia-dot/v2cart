/**
 * Delivery address rules.
 *
 * Pure functions, no React — so the validation can be checked, and so the
 * address book screen and checkout can't drift apart on what counts as a
 * valid address. An address accepted in one place must be accepted in the
 * other, or the customer saves something that fails at checkout.
 *
 * Field names follow the backend's schema (`name`, not `fullName`).
 */

export const EMPTY_ADDRESS = {
  name: '',
  phoneNo: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  addressType: 'home',
};

export const ADDRESS_TYPES = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
];

export function validateAddress(form) {
  const errors = {};
  if (!form.name?.trim()) errors.name = 'Enter the name for this delivery.';
  if (!/^\d{10}$/.test(String(form.phoneNo ?? '').trim()))
    errors.phoneNo = 'Enter a 10-digit phone number.';
  if (!form.address?.trim()) errors.address = 'Enter the street address.';
  if (!form.city?.trim()) errors.city = 'Enter the city.';
  if (!form.state?.trim()) errors.state = 'Enter the state.';
  if (!/^\d{6}$/.test(String(form.pincode ?? '').trim()))
    errors.pincode = 'Enter a 6-digit PIN code.';
  return errors;
}

/** The shape the backend wants: digits as numbers, not strings. */
export function toAddressPayload(form) {
  return {
    name: String(form.name).trim(),
    phoneNo: Number(String(form.phoneNo).trim()),
    address: String(form.address).trim(),
    city: String(form.city).trim(),
    state: String(form.state).trim(),
    pincode: Number(String(form.pincode).trim()),
    addressType: form.addressType || 'home',
  };
}

/**
 * What makes two addresses "the same" for de-duplication.
 *
 * The label (`name`) and type are deliberately excluded: "Home" and "Mum's"
 * at the same street address are one place, and saving it twice because the
 * label differs is what fills an address book with noise.
 */
export const addressKey = (a) =>
  [a?.address, a?.city, a?.state, a?.pincode, a?.phoneNo]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .join('|');

/** Is this address already in the book? */
export const isSavedAlready = (saved = [], candidate) =>
  saved.some((a) => addressKey(a) === addressKey(candidate));

/** The one to pre-select at checkout: the default, else the first saved. */
export const preferredAddress = (saved = []) =>
  saved.find((a) => a.isDefault) || saved[0] || null;
