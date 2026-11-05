import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, type, shadow, duration, TOUCH_TARGET } from '../../theme';
import { Price } from '../ui';
import { isOutOfStock, discountPercent } from '../../utils/pricing';
import { useCartStore, cartLineKey } from '../../store/cartStore';
import { useWishlistStore } from '../../store/wishlistStore';

/**
 * The product card, used by the home rails and the search grid.
 *
 * `width` is passed in rather than measured so the caller controls the
 * layout: rails want a fixed card, the grid wants a computed column.
 *
 * ── Why every block has a reserved height ──────────────────────────────────
 *
 * In a two-column grid, a card whose name wraps to one line or that has no
 * rating used to come out shorter than its neighbour, so each row sat on a
 * ragged baseline. The name block and the rating line are therefore fixed
 * height whether or not they have content — the row reads as a row.
 *
 * Buying happens here too: from a grid of results, "add this one" shouldn't
 * require a detour through the product page and back.
 *
 * ── Why the quantity comes from the cart ───────────────────────────────────
 *
 * This card used to hold an `added` boolean and flash the button green for a
 * moment. That boolean was local component state pretending to be cart state:
 * it was lost the instant the card unmounted, so leaving the screen and
 * coming back showed "Add to cart" for something already in the basket, and
 * tapping again silently added a second one.
 *
 * The control now reads the live line quantity out of the store. Nothing is
 * remembered locally, so there is nothing to go stale — and the stepper is
 * the honest answer to "how many of these do I have?".
 */

const BLUR_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkqAcAAIUAgUW0RjgAAAAASUVORK5CYII=';

/** Two lines of `smallMedium` (20pt each). */
const NAME_HEIGHT = 40;
const RATING_HEIGHT = 16;


/**
 * Height of everything below the image, which is square.
 *
 * Exported so a loading skeleton can reserve the card's real height
 * (`width + CARD_BODY_HEIGHT`) instead of a hardcoded guess that silently
 * drifts every time this card gains a row.
 *
 * padding 24 + eyebrow 16 + name 40 + rating 16 + price ~20 + cart bar 36
 * + its 4pt top margin + four 4pt gaps = 172.
 */
export const CARD_BODY_HEIGHT = 172;

/**
 * Add, then adjust.
 *
 * Zero shows a button; anything above zero shows the count with − and +. The
 * two states are deliberately the same size and colour as each other, so a
 * grid doesn't change shape or visual weight as items go into the cart.
 *
 * Decrementing from one removes the line, and says so with a bin icon rather
 * than a minus — "take it out" and "make it fewer" are different intentions.
 */
function CartControl({ product, soldOut, onError }) {
  // The no-variant line. A product added from its own page with a colour or
  // size is a different line, and this counter deliberately doesn't claim it:
  // one stepper can't unambiguously raise or lower "the 12x12 one or the
  // 24x24 one". Those are adjusted from the cart or the product page.
  const key = cartLineKey(product._id, null);
  // A primitive selector: this re-renders when *this* line's count changes,
  // not whenever anything in the cart does.
  const quantity = useCartStore((s) => s.items.find((i) => i.key === key)?.quantity ?? 0);
  const add = useCartStore((s) => s.add);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);

  const [busy, setBusy] = useState(false);

  const max = Number(product.stock) > 0 ? Number(product.stock) : 0;
  const atMax = quantity >= max;

  const runAdd = async () => {
    setBusy(true);
    onError(null);
    // No variant: a card can't ask which colour, so this adds the default
    // line. Products with options are better added from their own page, which
    // is where the variant chips live.
    const result = await add(product, 1, null);
    setBusy(false);
    if (!result.ok) onError(result.error);
  };

  if (soldOut) {
    return (
      <View style={[styles.cartBar, styles.cartBarOff]}>
        <Ionicons name="close" size={15} color={colors.inkMuted} />
        <Text style={[type.captionMedium, { color: colors.inkMuted }]}>Out of stock</Text>
      </View>
    );
  }

  if (quantity === 0) {
    return (
      <Pressable
        onPress={runAdd}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ busy }}
        accessibilityLabel={`Add ${product.name} to cart`}
        style={({ pressed }) => [styles.cartBar, pressed && { opacity: 0.85 }]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <>
            <Ionicons name="bag-add-outline" size={15} color={colors.white} />
            <Text style={[type.captionMedium, { color: colors.white }]} numberOfLines={1}>
              Add to cart
            </Text>
          </>
        )}
      </Pressable>
    );
  }

  const stepLabel = quantity === 1 ? `Remove ${product.name} from cart` : 'Decrease quantity';

  return (
    <View
      style={styles.cartBar}
      // The card itself is pressable and navigates. Claiming the responder
      // here stops a tap that lands between − and + from opening the product
      // instead of adjusting the count.
      onStartShouldSetResponder={() => true}
      accessibilityRole="adjustable"
      accessibilityLabel={`${product.name}, ${quantity} in cart`}
      accessibilityValue={{ min: 0, max, now: quantity }}
    >
      <Pressable
        onPress={() => (quantity === 1 ? remove(key) : setQuantity(key, quantity - 1))}
        accessibilityRole="button"
        accessibilityLabel={stepLabel}
        style={({ pressed }) => [styles.step, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name={quantity === 1 ? 'trash-outline' : 'remove'} size={15} color={colors.white} />
      </Pressable>

      <Text style={[type.captionMedium, styles.stepCount]}>{quantity}</Text>

      <Pressable
        onPress={() => setQuantity(key, quantity + 1)}
        disabled={atMax}
        accessibilityRole="button"
        accessibilityState={{ disabled: atMax }}
        accessibilityLabel={atMax ? `Only ${max} in stock` : 'Increase quantity'}
        style={({ pressed }) => [styles.step, pressed && !atMax && { opacity: 0.6 }]}
      >
        <Ionicons name="add" size={15} color={atMax ? 'rgba(255,255,255,0.35)' : colors.white} />
      </Pressable>
    </View>
  );
}

function WishlistHeart({ productId, name }) {
  const saved = useWishlistStore((s) => s.ids.has(String(productId)));
  const busy = useWishlistStore((s) => s.pending.has(String(productId)));
  const toggle = useWishlistStore((s) => s.toggle);

  return (
    <Pressable
      onPress={() => toggle(productId)}
      // Sits on the image, so the tap area is widened rather than the button.
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      style={({ pressed }) => [styles.heart, pressed && { opacity: 0.7 }]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.danger} />
      ) : (
        <Ionicons
          name={saved ? 'heart' : 'heart-outline'}
          size={18}
          color={saved ? colors.danger : colors.inkSecondary}
        />
      )}
    </Pressable>
  );
}

function ProductCard({ product, width = 168 }) {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;

  // Only a transient failure message lives here now; the quantity itself
  // comes from the cart.
  const [error, setError] = useState(null);

  const image = product.images?.find((i) => i.isFeatured)?.url || product.images?.[0]?.url;
  const soldOut = isOutOfStock(product);
  const discount = discountPercent(product);
  // `category` is populated to { name, slug } by the list endpoints, but a
  // bare id comes back from some of them — only render a real name.
  const categoryName = product.category?.name;

  const animate = (to) =>
    Animated.timing(scale, { toValue: to, duration: duration.fast, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], width }}>
      <Pressable
        onPress={() => router.push(`/product/${product._id}`)}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ₹${product.price}${soldOut ? ', out of stock' : ''}`}
        style={styles.card}
      >
        <View style={styles.imageWrap}>
          <Image
            source={image}
            placeholder={BLUR_PLACEHOLDER}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            style={styles.image}
          />

          {/* Out of stock wins over the discount badge — you can't buy it,
              so the saving is irrelevant. */}
          {soldOut ? (
            <View style={styles.soldOutOverlay}>
              <Text style={styles.soldOutText}>OUT OF STOCK</Text>
            </View>
          ) : discount > 0 ? (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{discount}%</Text>
            </View>
          ) : null}

          {/* Saving something is worth doing even when it's out of stock —
              arguably especially then. */}
          <WishlistHeart productId={product._id} name={product.name} />
        </View>

        <View style={styles.body}>
          {/* Category eyebrow, as on the web card — it tells you what kind of
              thing this is before you've read the name. */}
          <Text style={styles.eyebrow} numberOfLines={1}>
            {categoryName ? categoryName.toUpperCase() : ' '}
          </Text>

          <Text style={[type.smallMedium, styles.name]} numberOfLines={2}>
            {product.name}
          </Text>

          <View style={styles.ratingRow}>
            {product.ratings > 0 ? (
              <>
                <Ionicons name="star" size={12} color={colors.warning} />
                <Text style={[type.caption, { color: colors.inkSecondary }]}>
                  {Number(product.ratings).toFixed(1)}
                  {product.numOfReviews ? ` (${product.numOfReviews})` : ''}
                </Text>
              </>
            ) : (
              <Text style={[type.caption, { color: colors.inkMuted }]}>No reviews yet</Text>
            )}
          </View>

          <Price value={product.price} cutted={product.cuttedPrice} />

          <CartControl product={product} soldOut={soldOut} onError={setError} />

          {error ? (
            <Text style={[type.caption, { color: colors.danger }]} numberOfLines={2}>
              {error}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  imageWrap: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceAlt },
  image: { width: '100%', height: '100%' },
  soldOutOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutText: {
    ...type.captionMedium,
    color: colors.white,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    overflow: 'hidden',
    letterSpacing: 0.4,
  },
  discountBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  discountText: { ...type.caption, color: colors.white, fontWeight: '700' },
  heart: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    // Opaque rather than translucent: a heart over a busy photo has to stay
    // readable, and there's no backdrop blur to lean on.
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  body: { padding: spacing.md, gap: spacing.xs },
  eyebrow: {
    ...type.caption,
    color: colors.inkSecondary,
    letterSpacing: 0.6,
  },
  // Fixed heights: see the note at the top of the file.
  name: { color: colors.ink, height: NAME_HEIGHT },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: RATING_HEIGHT,
  },
  // Both states of the control share this: same height, same fill, same
  // radius — so a card looks identical in weight whether or not it's in the
  // cart, and `CARD_BODY_HEIGHT` stays true.
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    height: TOUCH_TARGET - 8,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
    overflow: 'hidden',
  },
  cartBarOff: { backgroundColor: colors.surfaceAlt },
  step: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCount: {
    color: colors.white,
    minWidth: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});

// Rails and grids re-render often; the card itself only changes when the
// product does.
export default React.memo(ProductCard);
