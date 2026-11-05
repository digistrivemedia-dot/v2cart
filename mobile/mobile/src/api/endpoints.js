/**
 * Every backend call the customer app makes. Kept in one file so the API
 * surface the app depends on is visible at a glance — and so nothing invents
 * an endpoint that doesn't exist.
 *
 * All of these already serve the web client; the app added no backend routes.
 */
import api from './client';

/* ---------------------------------- auth --------------------------------- */

export const authApi = {
  // Backend defaults role to 'user' when none is sent — i.e. a customer.
  register: (payload) => api.post('/register', payload).then((r) => r.data),
  login: (email, password) => api.post('/login', { email, password }).then((r) => r.data),
  me: () => api.get('/me').then((r) => r.data),
  logout: () => api.get('/logout').then((r) => r.data),
  updateProfile: (payload) => api.put('/me/update', payload).then((r) => r.data),
  forgotPassword: (email) => api.post('/password/forgot', { email }).then((r) => r.data),
};

/* -------------------------------- products ------------------------------- */

export const productApi = {
  /**
   * `params` mirrors the web search page: keyword, category, page, limit, and
   * price range as price[gte] / price[lte] (the backend's SearchFeatures
   * rewrites gt/gte/lt/lte into Mongo operators).
   */
  list: (params = {}) => api.get('/products', { params }).then((r) => r.data),
  /** Unpaginated, used by the home rails. */
  all: () => api.get('/products/all').then((r) => r.data),
  detail: (id) => api.get(`/product/${id}`).then((r) => r.data),
};

export const categoryApi = {
  list: () => api.get('/categories').then((r) => r.data),
};

export const sliderApi = {
  active: () => api.get('/active').then((r) => r.data),
};

/* --------------------------------- orders -------------------------------- */

export const orderApi = {
  create: (payload) => api.post('/order/new', payload).then((r) => r.data),
  mine: () => api.get('/orders/me').then((r) => r.data),
  detail: (id) => api.get(`/order/${id}`).then((r) => r.data),
};

/* -------------------------------- payments ------------------------------- */

export const paymentApi = {
  /**
   * Returns `{ order, key_id }` — plus `mock: true` and a ready-made
   * `mockPayment` proof when the backend runs with PAYMENTS_MOCK. The app
   * honours that the same way the web does, so checkout is testable with no
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
