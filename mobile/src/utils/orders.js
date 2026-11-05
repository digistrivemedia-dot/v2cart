/**
 * Order presentation helpers.
 *
 * Shared by the order list and the order detail screen. They live here rather
 * than in either route file so neither screen has to import the other — a
 * route importing a route drags a whole screen into the wrong bundle.
 */

/** Order status → how it should read. */
export const STATUS_TONE = {
  Pending: { tone: 'warning', icon: 'time-outline' },
  Confirmed: { tone: 'accent', icon: 'checkmark-circle-outline' },
  Processing: { tone: 'accent', icon: 'sync-outline' },
  Packed: { tone: 'accent', icon: 'cube-outline' },
  Shipped: { tone: 'accent', icon: 'airplane-outline' },
  Delivered: { tone: 'success', icon: 'checkmark-done-outline' },
  Cancelled: { tone: 'danger', icon: 'close-circle-outline' },
};

/** The fulfilment stages an order moves through, in order. */
export const ORDER_STAGES = ['Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered'];

/**
 * A short, quotable reference.
 *
 * The full Mongo id is 24 hex characters — unreadable and unrepeatable over
 * the phone. The last six are enough to identify an order among one
 * customer's own.
 */
export const orderRef = (id) => `#${String(id).slice(-6).toUpperCase()}`;

export const orderDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

/** Newest first. `/orders/me` returns them unsorted. */
export const sortNewestFirst = (orders = []) =>
  [...orders].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
