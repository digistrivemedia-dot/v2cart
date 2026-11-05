import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  Linking,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, shadow, TOUCH_TARGET } from '../../src/theme';
import { productApi } from '../../src/api/endpoints';
import { useAsync } from '../../src/hooks/useAsync';
import {
  Button,
  Price,
  Badge,
  Chip,
  QuantityStepper,
  SectionHeader,
  Skeleton,
  ErrorState,
  Divider,
  IconButton,
} from '../../src/components/ui';
import ProductCard, { CARD_BODY_HEIGHT } from '../../src/components/product/ProductCard';
import ProductFAQ from '../../src/components/product/ProductFAQ';
import TagBadges from '../../src/components/product/TagBadges';
import { useCartStore } from '../../src/store/cartStore';
import { useWishlistStore } from '../../src/store/wishlistStore';
import { isOutOfStock, formatRupees, discountPercent } from '../../src/utils/pricing';
import {
  variantFacets,
  availability,
  resolveVariant,
  variantImages,
  initialSelection,
  variantOptions,
} from '../../src/utils/variants';

const { width: SCREEN_W } = Dimensions.get('window');
const RELATED_CARD_W = 168;

/**
 * Support contact, as on the web product page.
 *
 * The web reads this from `constants/config.ts`; there is no endpoint for it,
 * so it is a constant on both sides. Change it in both places.
 */
const SUPPORT_PHONE = '+91 90000 00000';

const titleCase = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);

function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!children) return null;
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.accordionHeader}
      >
        <Text style={[type.bodyMedium, { color: colors.ink, flex: 1 }]}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSecondary} />
      </Pressable>
      {open ? <View style={{ paddingBottom: spacing.lg }}>{children}</View> : null}
      <Divider />
    </View>
  );
}

/** One `Label: value` row, used by both specification lists. */
function SpecRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.specRow}>
      <Text style={[type.small, { color: colors.inkMuted, flex: 1 }]}>{label}</Text>
      <Text style={[type.smallMedium, { color: colors.ink, flex: 1.4, textAlign: 'right' }]}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Colour swatches, image-based like the web's.
 *
 * A colour name is a poor preview of a tile; the variant's own photo is the
 * actual thing being chosen. Colours that don't exist in the selected size
 * stay tappable but are dimmed and labelled — the web does the same, because
 * hiding them makes the list jump around as you pick sizes.
 */
function ColorSwatches({ product, colors: list, selected, available, onSelect }) {
  if (list.length < 1) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.smallMedium, { color: colors.ink }]}>Available colours</Text>
      <FlatList
        data={list}
        keyExtractor={(c) => c}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.md }}
        renderItem={({ item: color }) => {
          const option = variantOptions(product).find((o) => o.color === color);
          const image = variantImages(product, option)[0]?.url;
          const isAvailable = available.includes(color);
          const isSelected = selected === color;

          return (
            <Pressable
              onPress={() => onSelect(color)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={
                isAvailable ? color : `${color}, not available in the selected size`
              }
              style={({ pressed }) => [
                styles.swatch,
                isSelected && styles.swatchSelected,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Image
                source={image}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
                style={[styles.swatchImage, !isAvailable && { opacity: 0.45 }]}
              />
              <View style={styles.swatchLabel}>
                <Text style={[type.caption, { color: colors.white }]} numberOfLines={1}>
                  {color}
                </Text>
              </View>
              {isSelected ? (
                <View style={styles.swatchTick}>
                  <Ionicons name="checkmark" size={12} color={colors.white} />
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [imageIndex, setImageIndex] = useState(0);
  const gallery = useRef(null);
  const [selection, setSelection] = useState({ color: '', size: '', finish: '' });
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);

  const addToCart = useCartStore((s) => s.add);
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  const { data, loading, error, refetch } = useAsync(() => productApi.detail(id), [id]);
  const product = data?.product;

  // The web's "Previously Viewed" rail is, despite the name, just the ten
  // most recent products — so this matches what it actually does.
  const related = useAsync(() => productApi.list({ limit: 10 }), []);

  const saved = useWishlistStore((s) => s.ids.has(String(id)));
  const savePending = useWishlistStore((s) => s.pending.has(String(id)));
  const toggleSaved = useWishlistStore((s) => s.toggle);

  // Seed the selection once the product arrives, from the product's own
  // colour/size/finish — the page should open on what it describes.
  useEffect(() => {
    if (product) setSelection(initialSelection(product));
  }, [product]);

  const facets = useMemo(() => (product ? variantFacets(product) : { colors: [], sizes: [], finishes: [] }), [product]);
  const { sizesForColor, colorsForSize } = useMemo(
    () => (product ? availability(product, selection) : { sizesForColor: [], colorsForSize: [] }),
    [product, selection]
  );
  const variant = useMemo(
    () => (product ? resolveVariant(product, selection) : null),
    [product, selection]
  );
  const images = useMemo(
    () => (product ? variantImages(product, variant) : []),
    [product, variant]
  );

  // Price stays the product's, never the variant's: the cart and the investor
  // margin maths are both derived from `product.price` server-side, so
  // showing a variant price here would quote a number the cart won't charge.
  const price = Number(product?.price) || 0;
  const stock = Number(variant?.stock ?? product?.stock) || 0;
  const soldOut = product ? (variant ? stock <= 0 : isOutOfStock(product)) : false;
  const discount = product ? discountPercent(product) : 0;
  const maxQty = Math.max(stock, 0);

  // A fresh colour can invalidate the chosen size; move to one that exists
  // rather than leaving an impossible pair selected.
  const pickColor = (color) => {
    const sizes = availability(product, { color }).sizesForColor;
    setSelection((s) => ({
      ...s,
      color,
      size: sizes.includes(s.size) ? s.size : sizes[0] || '',
    }));
  };

  const pickSize = (size) => {
    const colorsWithSize = availability(product, { size }).colorsForSize;
    setSelection((s) => ({
      ...s,
      size,
      color: colorsWithSize.includes(s.color) ? s.color : colorsWithSize[0] || '',
    }));
  };

  // Clamp the quantity down when a variant has less stock than was picked.
  useEffect(() => {
    setQuantity((q) => Math.max(1, Math.min(q, maxQty || 1)));
  }, [maxQty]);

  // A new colour swaps the gallery out from under the pager. Without this,
  // moving from a four-image colour to a one-image colour leaves the index
  // pointing past the end and the dots reading wrong.
  useEffect(() => {
    setImageIndex(0);
    // The state alone only fixes the dots; the list has to come back too.
    gallery.current?.scrollToOffset({ offset: 0, animated: false });
  }, [selection.color]);

  const onAdd = async () => {
    setAddError(null);
    setAdding(true);
    const chosen = facets.colors.length || facets.sizes.length
      ? { color: selection.color || undefined, size: selection.size || undefined }
      : null;
    const result = await addToCart(product, quantity, chosen);
    setAdding(false);

    if (result.ok) {
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
    } else {
      setAddError(result.error);
    }
  };

  const contact = (channel) => {
    const digits = SUPPORT_PHONE.replace(/[^\d]/g, '');
    const message = `Hi, I'm interested in ${product?.name ?? 'a product'}`;
    const url =
      channel === 'whatsapp'
        ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
        : `tel:${digits}`;

    // A device with no dialler or WhatsApp shouldn't throw — say so instead.
    Linking.openURL(url).catch(() =>
      setAddError(
        channel === 'whatsapp'
          ? "Couldn't open WhatsApp on this device."
          : "Couldn't start a call on this device."
      )
    );
  };

  if (loading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
        <Skeleton height={SCREEN_W} borderRadius={0} />
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton width="80%" height={24} />
          <Skeleton width="40%" height={28} />
          <Skeleton width="100%" height={80} />
        </View>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        <ErrorState message={error || 'This product is no longer available.'} onRetry={refetch} />
      </View>
    );
  }

  const stockTone = stock > 50 ? colors.success : stock > 10 ? colors.warning : colors.danger;

  const specs = [
    ...(product.specifications || []).map((s) => ({ label: s.title, value: s.description })),
    { label: 'Category', value: product.category?.name },
    { label: 'Subcategory', value: product.subcategory?.name },
    { label: 'Material', value: titleCase(product.material) },
    { label: 'Colour', value: product.color },
    { label: 'Size', value: product.size },
    { label: 'Finish', value: titleCase(product.finish) },
    // Only worth a row when there's a choice to describe.
    { label: 'Available colours', value: facets.colors.length > 1 ? facets.colors.join(', ') : null },
    { label: 'Available sizes', value: facets.sizes.length > 1 ? facets.sizes.join(', ') : null },
    {
      label: 'Available finishes',
      value: facets.finishes.length > 1 ? facets.finishes.map(titleCase).join(', ') : null,
    },
  ].filter((row) => row.label && row.value);
  const relatedProducts = (related.data?.products ?? []).filter((p) => String(p._id) !== String(id));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Floating controls over the gallery, kept clear of the notch. */}
      <View style={[styles.floatingBar, { top: insets.top + spacing.sm }]}>
        <IconButton
          name="arrow-back"
          label="Go back"
          onPress={() => router.back()}
          style={styles.floatingBtn}
        />
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => toggleSaved(id)}
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
          accessibilityLabel={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          style={({ pressed }) => [styles.floatingBtn, styles.floatingPress, pressed && { opacity: 0.7 }]}
        >
          {savePending ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={22}
              color={saved ? colors.danger : colors.ink}
            />
          )}
        </Pressable>
        <IconButton
          name="bag-handle-outline"
          label={`Cart, ${cartCount} items`}
          badge={cartCount}
          onPress={() => router.push('/cart')}
          style={styles.floatingBtn}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Gallery — follows the selected colour's images. */}
        <View>
          <FlatList
            ref={gallery}
            data={images.length ? images : [{ url: null }]}
            keyExtractor={(img, i) => `${img.url ?? 'placeholder'}-${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setImageIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
            }
            renderItem={({ item }) => (
              <Image
                source={item.url}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                style={{ width: SCREEN_W, height: SCREEN_W, backgroundColor: colors.surfaceAlt }}
              />
            )}
          />

          {soldOut ? (
            <View style={styles.soldOutOverlay}>
              <Text style={styles.soldOutText}>OUT OF STOCK</Text>
            </View>
          ) : null}

          {images.length > 1 ? (
            <View style={styles.dots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <TagBadges tags={product.tags} />

          <Text style={[type.h1, { color: colors.ink }]}>{product.name}</Text>

          {product.shortDescription ? (
            <Text style={[type.body, { color: colors.inkSecondary }]}>
              {product.shortDescription}
            </Text>
          ) : null}

          {/* Product ID, as the web shows it — it's what customers quote to
              support, so it has to be readable, not buried. */}
          <View style={styles.idChip}>
            <Text style={[type.caption, { color: colors.inkSecondary }]}>Product ID</Text>
            <Text style={[type.captionMedium, { color: colors.ink }]} selectable>
              {variant?.productId || product.productId || product._id}
            </Text>
          </View>

          {product.ratings > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="star" size={14} color={colors.warning} />
              <Text style={[type.small, { color: colors.inkSecondary }]}>
                {Number(product.ratings).toFixed(1)} · {product.numOfReviews || 0} reviews
              </Text>
            </View>
          ) : null}

          {/* Price panel — price, MRP, saving and stock in one block, the way
              the web groups them. */}
          <View style={styles.priceCard}>
            {price > 0 ? (
              <View style={styles.priceRow}>
                <Price value={price} cutted={product.cuttedPrice} size="lg" />
                {discount > 0 ? (
                  <View style={styles.offBadge}>
                    <Text style={[type.captionMedium, { color: colors.white }]}>
                      {discount}% OFF
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={{ gap: spacing.xs }}>
                <Text style={[type.price, { color: colors.navy }]}>Get Price</Text>
                <Text style={[type.small, { color: colors.inkSecondary }]}>
                  Price on request — message us for a quote.
                </Text>
              </View>
            )}

            {soldOut ? (
              <Badge label="Out of stock" tone="danger" icon="close-circle" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="cube-outline" size={14} color={stockTone} />
                <Text style={[type.small, { color: stockTone }]}>
                  {stock} unit{stock === 1 ? '' : 's'} available
                </Text>
              </View>
            )}
          </View>

          <ColorSwatches
            product={product}
            colors={facets.colors}
            selected={selection.color}
            available={colorsForSize}
            onSelect={pickColor}
          />

          {facets.sizes.length ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.smallMedium, { color: colors.ink }]}>Available sizes</Text>
              <View style={styles.chipWrap}>
                {facets.sizes.map((size) => {
                  const isAvailable = sizesForColor.includes(size);
                  return (
                    <Pressable
                      key={size}
                      onPress={() => pickSize(size)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selection.size === size }}
                      accessibilityLabel={
                        isAvailable
                          ? size
                          : `${size}, not available in ${selection.color || 'this colour'}`
                      }
                      style={({ pressed }) => [
                        styles.sizeBtn,
                        selection.size === size && styles.sizeBtnOn,
                        !isAvailable && styles.sizeBtnOff,
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Text
                        style={[
                          type.smallMedium,
                          {
                            color: selection.size === size
                              ? colors.accentDark
                              : isAvailable
                                ? colors.ink
                                : colors.inkMuted,
                            // Marks a combination that doesn't exist without
                            // removing the tap that switches to it.
                            textDecorationLine: isAvailable ? 'none' : 'line-through',
                          },
                        ]}
                      >
                        {size}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {facets.finishes.length ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.smallMedium, { color: colors.ink }]}>Finish</Text>
              <View style={styles.chipWrap}>
                {facets.finishes.map((finish) => (
                  <Chip
                    key={finish}
                    label={titleCase(finish)}
                    selected={selection.finish === finish}
                    onPress={() =>
                      setSelection((s) => ({
                        ...s,
                        finish: s.finish === finish ? '' : finish,
                      }))
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          {!soldOut ? (
            <View style={styles.qtyRow}>
              <Text style={[type.bodyMedium, { color: colors.ink, flex: 1 }]}>Quantity</Text>
              <QuantityStepper value={quantity} onChange={setQuantity} min={1} max={maxQty || 1} />
            </View>
          ) : null}

          {/* Talk to a human — the web puts these on every product page, and
              for a price-on-request item they are the only way to buy. */}
          <View style={styles.contactRow}>
            <Pressable
              onPress={() => contact('whatsapp')}
              accessibilityRole="button"
              accessibilityLabel="Ask about this product on WhatsApp"
              style={({ pressed }) => [styles.contactBtn, styles.whatsapp, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="logo-whatsapp" size={18} color={colors.white} />
              <Text style={[type.smallMedium, { color: colors.white }]}>WhatsApp</Text>
            </Pressable>
            <Pressable
              onPress={() => contact('call')}
              accessibilityRole="button"
              accessibilityLabel="Call support about this product"
              style={({ pressed }) => [styles.contactBtn, styles.call, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="call" size={18} color={colors.white} />
              <Text style={[type.smallMedium, { color: colors.white }]}>Call us</Text>
            </Pressable>
          </View>
        </View>

        <Divider />

        <View style={{ paddingHorizontal: spacing.lg }}>
          {product.description ? (
            <Accordion title="Description" defaultOpen>
              <Text style={[type.body, { color: colors.inkSecondary }]}>{product.description}</Text>
            </Accordion>
          ) : null}

          {product.highlights?.length ? (
            <Accordion title="Highlights" defaultOpen>
              {product.highlights.map((h, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={[type.small, { color: colors.inkSecondary, flex: 1 }]}>{h}</Text>
                </View>
              ))}
            </Accordion>
          ) : null}

          {/* Two kinds of specification, as on the web: the vendor's own
              rows, then what the catalogue knows about the product. Empty
              rows are dropped so the section never opens onto nothing. */}
          {specs.length ? (
            <Accordion title="Specifications">
              {specs.map((row) => (
                <SpecRow key={row.label} label={row.label} value={row.value} />
              ))}
            </Accordion>
          ) : null}

          {product.careInstructions?.length ? (
            <Accordion title="Care instructions">
              {product.careInstructions.map((c, i) => (
                <View key={i} style={{ marginBottom: spacing.md }}>
                  {c.title ? (
                    <Text style={[type.smallMedium, { color: colors.ink }]}>{c.title}</Text>
                  ) : null}
                  <Text style={[type.small, { color: colors.inkSecondary }]}>{c.description}</Text>
                </View>
              ))}
            </Accordion>
          ) : null}
        </View>

        <ProductFAQ />

        {relatedProducts.length ? (
          <View style={{ marginBottom: spacing.xl }}>
            <SectionHeader title="You may also like" subtitle="Recently added to the store" />
            <FlatList
              data={relatedProducts}
              keyExtractor={(p) => String(p._id)}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
              renderItem={({ item }) => <ProductCard product={item} width={RELATED_CARD_W} />}
              initialNumToRender={3}
            />
          </View>
        ) : related.loading ? (
          <View style={{ flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg }}>
            {[0, 1].map((i) => (
              <Skeleton
                key={i}
                width={RELATED_CARD_W}
                height={RELATED_CARD_W + CARD_BODY_HEIGHT}
                borderRadius={radius.lg}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky buy bar — the primary action is always in thumb reach, and
          clear of the home indicator. */}
      {addError ? (
        <Text style={[type.small, styles.buyError]} numberOfLines={2}>
          {addError}
        </Text>
      ) : null}

      <View style={[styles.buyBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.inkMuted }]}>Total</Text>
          <Text style={[type.priceSmall, { color: colors.ink }]}>
            {price > 0 ? formatRupees(price * quantity) : 'On request'}
          </Text>
        </View>
        <Button
          title={
            soldOut
              ? 'Out of stock'
              : price === 0
                ? 'Enquire'
                : added
                  ? 'Added to cart'
                  : 'Add to cart'
          }
          icon={added ? 'checkmark' : soldOut ? undefined : price === 0 ? 'chatbubble-ellipses-outline' : 'bag-add-outline'}
          onPress={price === 0 ? () => contact('whatsapp') : onAdd}
          loading={adding}
          disabled={soldOut}
          fullWidth={false}
          style={{ flex: 1.4 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  floatingBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    ...shadow.md,
  },
  floatingPress: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutText: {
    ...type.bodyMedium,
    color: colors.white,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
  dots: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dotActive: { width: 20, backgroundColor: colors.white },
  idChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  priceCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.accentSoft,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  offBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.success,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  swatchSelected: { borderColor: colors.accent },
  swatchImage: { width: '100%', height: '100%' },
  swatchLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.72)',
  },
  swatchTick: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sizeBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  sizeBtnOff: { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  contactRow: { flexDirection: 'row', gap: spacing.md },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
  },
  whatsapp: { backgroundColor: '#16a34a' },
  call: { backgroundColor: '#2563eb' },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET + 6,
  },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  specRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  buyError: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
