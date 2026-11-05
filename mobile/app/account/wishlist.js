import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Dimensions, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, TOUCH_TARGET } from '../../src/theme';
import { Price, Badge, EmptyState, Skeleton, Divider, IconButton } from '../../src/components/ui';
import { useWishlistStore } from '../../src/store/wishlistStore';
import { useCartStore } from '../../src/store/cartStore';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Saved products.
 *
 * A list rather than the two-column grid the search page uses: these are
 * things the customer already chose, so the useful actions are "move it to
 * the cart" and "I've changed my mind" — both of which need room for a label,
 * not an icon in a card corner.
 */
function Line({ item, onRemove, onAdd, busy }) {
  const router = useRouter();
  const soldOut = !(Number(item.stock) > 0);

  return (
    <Pressable
      onPress={() => router.push(`/product/${item.productId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ₹${item.price}`}
      style={({ pressed }) => [styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <Image
        source={item.image}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        style={styles.thumb}
      />

      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={2}>
          {item.name}
        </Text>

        <Price value={item.price} cutted={item.cuttedPrice} />

        {soldOut ? <Badge label="Out of stock" tone="danger" icon="close-circle" /> : null}

        <View style={styles.lineActions}>
          <Pressable
            onPress={() => onAdd(item)}
            disabled={soldOut || busy}
            accessibilityRole="button"
            accessibilityLabel={`Move ${item.name} to cart`}
            style={({ pressed }) => [
              styles.moveBtn,
              soldOut && styles.moveBtnOff,
              pressed && !soldOut && { opacity: 0.8 },
            ]}
          >
            <Ionicons
              name="bag-add-outline"
              size={14}
              color={soldOut ? colors.inkMuted : colors.white}
            />
            <Text
              style={[type.captionMedium, { color: soldOut ? colors.inkMuted : colors.white }]}
            >
              Move to cart
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onRemove(item)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name} from wishlist`}
            style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="heart-dislike-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export default function WishlistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const items = useWishlistStore((s) => s.items);
  const ids = useWishlistStore((s) => s.ids);
  const remote = useWishlistStore((s) => s.remote);
  const refresh = useWishlistStore((s) => s.refresh);
  const toggle = useWishlistStore((s) => s.toggle);

  const addToCart = useCartStore((s) => s.add);

  const [loading, setLoading] = useState(remote && items.length === 0);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hearts elsewhere in the app write to the same store, so coming back to
  // this screen should show what they did.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const moveToCart = async (item) => {
    setBusyId(item.productId);
    setNotice(null);

    // The wishlist row carries enough of the product for the cart to take it.
    const result = await addToCart(
      {
        _id: item.productId,
        name: item.name,
        price: item.price,
        cuttedPrice: item.cuttedPrice,
        stock: item.stock,
        images: item.images,
      },
      1,
      null
    );

    if (result.ok) {
      // "Move" means move: a saved item that's now in the cart no longer
      // belongs on the saved list.
      await toggle(item.productId);
      setNotice(`${item.name} moved to your cart.`);
    } else {
      setNotice(result.error);
    }
    setBusyId(null);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <IconButton name="arrow-back" label="Go back" color={colors.white} onPress={() => router.back()} />
      <Text style={[type.h2, { color: colors.white, flex: 1 }]}>Wishlist</Text>
      {items.length ? (
        <Text style={[type.small, { color: colors.gold }]}>
          {items.length} item{items.length === 1 ? '' : 's'}
        </Text>
      ) : null}
    </View>
  );

  // Signed out, the heart only ever wrote ids to the device — there are no
  // product details to render, so say what's missing rather than show blanks.
  if (!remote) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        {header}
        <EmptyState
          icon="heart-outline"
          title={ids.size ? `${ids.size} saved on this device` : 'Nothing saved yet'}
          message="Sign in to see your saved products and keep them across devices."
          actionLabel="Sign in"
          onAction={() => router.push('/(auth)/login')}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        {header}
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={120} borderRadius={radius.lg} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {header}

      {notice ? (
        <Text style={[type.small, styles.notice]} numberOfLines={2}>
          {notice}
        </Text>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
        ItemSeparatorComponent={() => <Divider style={{ marginVertical: spacing.md }} />}
        renderItem={({ item }) => (
          <Line
            item={item}
            onRemove={(i) => toggle(i.productId)}
            onAdd={moveToCart}
            busy={busyId === item.productId}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="heart-outline"
            title="Nothing saved yet"
            message="Tap the heart on any product to keep it here for later."
            actionLabel="Browse products"
            onAction={() => router.push('/search')}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.navy,
  },
  line: { flexDirection: 'row', gap: spacing.md, borderRadius: radius.md },
  thumb: {
    width: SCREEN_W * 0.26,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  lineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  moveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: TOUCH_TARGET - 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.navy,
  },
  moveBtnOff: { backgroundColor: colors.surfaceAlt },
  removeBtn: {
    width: TOUCH_TARGET - 10,
    height: TOUCH_TARGET - 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    color: colors.success,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
