// Shared option lists for product forms — used by both the manual
// create-product form (SimpleProductForm) and the admin edit form.

export interface TagOption {
  value: string;
  label: string;
  emoji: string;
}

// Quality/marketing tags shown on product cards.
export const TAG_OPTIONS: TagOption[] = [
  { value: 'popular', label: 'Popular', emoji: '⭐' },
  { value: 'trending', label: 'Trending', emoji: '🔥' },
  { value: 'new', label: 'New', emoji: '✨' },
  { value: 'premium', label: 'Premium', emoji: '💎' },
  { value: 'exclusive', label: 'Exclusive', emoji: '👑' },
  { value: 'classic', label: 'Classic', emoji: '🏛️' },
  { value: 'bestseller', label: 'Best Seller', emoji: '🏆' },
  { value: 'limited', label: 'Limited Edition', emoji: '⏰' },
];

// Image upload constraints shared by every product image uploader.
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGES = 10;
export const VALID_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
