/**
 * Every backend call the customer app makes, in one file — so the API surface
 * the app depends on is visible at a glance, and so nothing invents an
 * endpoint that doesn't exist.
 *
 * All of these already serve the web client. The app added no backend routes.
 */
import api from './client';

/* ---------------------------------- auth --------------------------------- */

export const authApi = {
  // No `role` is sent, and the backend defaults it to 'user' — a customer.
  register: (payload) => api.post('/register', payload).then((r) => r.data),
  login: (email, password) => api.post('/login', { email, password }).then((r) => r.data),
  me: () => api.get('/me').then((r) => r.data),
  logout: () => api.get('/logout').then((r) => r.data),
  updateProfile: (payload) => api.put('/me/update', payload).then((r) => r.data),
  forgotPassword: (email) => api.post('/password/forgot', { email }).then((r) => r.data),
};

/* -------------------------------- catalogue ------------------------------ */

export const productApi = {
  /**
   * `params` mirrors the web search page: keyword, category, page, limit, and
   * price as price[gte] / price[lte] — the backend's SearchFeatures rewrites
   * gt/gte/lt/lte into Mongo operators.
   *
   * Only `listingStatus: 'live'` products come back, so unapproved vendor
   * listings never reach the app.
   */
  list: (params = {}) => api.get('/products', { params }).then((r) => r.data),
  detail: (id) => api.get(`/product/${id}`).then((r) => r.data),
};

export const categoryApi = {
  list: () => api.get('/categories').then((r) => r.data),
};

export const sliderApi = {
  /** Home hero slides. */
  active: () => api.get('/active').then((r) => r.data),
};

/* ---------------------------------- cart --------------------------------- */

/**
 * The cart lives on the user document server-side, which is what makes it the
 * same cart on the website and in the app. Every call returns the full cart,
 * so the store never has to reconstruct what the server did.
 *
 * All of these need a session — the guest basket stays on the device until
 * `merge` pushes it up at login.
 */
export const cartApi = {
  get: () => api.get('/cart').then((r) => r.data),
  add: (productId, quantity = 1, variant = null) =>
    api.post('/cart', { product: productId, quantity, variant }).then((r) => r.data),
  setQuantity: (itemId, quantity) =>
    api.put(`/cart/${itemId}`, { quantity }).then((r) => r.data),
  remove: (itemId) => api.delete(`/cart/${itemId}`).then((r) => r.data),
  clear: () => api.delete('/cart').then((r) => r.data),
  merge: (items) => api.post('/cart/merge', { items }).then((r) => r.data),
};

/* -------------------------------- settings ------------------------------- */

export const settingsApi = {
  /**
   * The GST rate, public because a guest totalling up a cart needs it.
   * Returns `{ gstPct }` and deliberately not the platform margin.
   */
  tax: () => api.get('/pricing-settings').then((r) => r.data),
};

/* -------------------------------- addresses ------------------------------ */

/**
 * Delivery addresses, stored on the user document.
 *
 * The schema calls the recipient `name`; checkout's form calls the same field
 * `fullName`. These take the backend's spelling — translation happens in the
 * screen, not here.
 *
 * Every call answers with the full `addresses` array, so the caller never has
 * to reconstruct the list.
 */
export const addressApi = {
  add: (payload) => api.post('/me/addresses/new', payload).then((r) => r.data),
  update: (addressId, payload) =>
    api.put(`/me/addresses/${addressId}`, payload).then((r) => r.data),
  remove: (addressId) => api.delete(`/me/addresses/${addressId}`).then((r) => r.data),
  setDefault: (addressId) =>
    api.put(`/me/addresses/${addressId}/default`).then((r) => r.data),
};

/* -------------------------------- wishlist ------------------------------- */

/**
 * Also stored on the user document, so a saved product shows up on the
 * website too. Removal is keyed by product id, not by row id — the caller is
 * a heart on a card, which knows the product it's showing and nothing else.
 */
export const wishlistApi = {
  get: () => api.get('/wishlist').then((r) => r.data),
  add: (productId) => api.post('/wishlist', { product: productId }).then((r) => r.data),
  remove: (productId) => api.delete(`/wishlist/${productId}`).then((r) => r.data),
  clear: () => api.delete('/wishlist').then((r) => r.data),
  merge: (productIds) => api.post('/wishlist/merge', { productIds }).then((r) => r.data),
};

/* --------------------------------- orders -------------------------------- */

export const orderApi = {
  /**
   * What this cart costs, per the server.
   *
   * Phase 23 — /order/new verifies the payment against a server-computed
   * total, so charging a locally-computed one risks a mismatch that refuses
   * the order after the customer has paid. The server owns the GST rate and
   * the shipping rule; this screen asks rather than assuming.
   */
  quote: (items, couponCode = null) =>
    api.post('/order/quote', { items, couponCode }).then((r) => r.data),
  create: (payload) => api.post('/order/new', payload).then((r) => r.data),
  mine: () => api.get('/orders/me').then((r) => r.data),
  detail: (id) => api.get(`/order/${id}`).then((r) => r.data),
};

/* -------------------------------- payments ------------------------------- */

export const paymentApi = {
  /**
   * Returns `{ order, key_id }` — plus `mock: true` and a ready-made
   * `mockPayment` proof when the backend runs with PAYMENTS_MOCK. Checkout
   * honours that the same way the web does, so the flow is testable with no
   * gateway involved.
   */
  createOrder: (amount, notes = {}) =>
    api
      .post('/payment/razorpay/order', {
        amount,
        currency: 'INR',
        receipt: `rcpt_${Date.now()}`,
        notes,
      })
      .then((r) => r.data),
  verify: (proof) => api.post('/payment/razorpay/verify', proof).then((r) => r.data),
};
