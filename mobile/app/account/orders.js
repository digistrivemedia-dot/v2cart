import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, TOUCH_TARGET } from '../../src/theme';
import { orderApi } from '../../src/api/endpoints';
import { useAsync } from '../../src/hooks/useAsync';
import { Badge, EmptyState, ErrorState, Skeleton, IconButton } from '../../src/components/ui';
import { formatRupees } from '../../src/utils/pricing';
import { STATUS_TONE, orderRef, orderDate, sortNewestFirst } from '../../src/utils/orders';

/**
 * Order history — newest first, because a history that opens on the oldest
 * order is useless.
 */

function OrderCard({ order }) {
  const router = useRouter();
  const status = STATUS_TONE[order.orderStatus] || STATUS_TONE.Pending;
  const items = order.orderItems || [];

  return (
    <Pressable
      onPress={() => router.push(`/account/order/${order._id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Order ${orderRef(order._id)}, ${order.orderStatus}, ${items.length} items`}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceAlt }]}
    >
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyMedium, { color: colors.ink }]}>{orderRef(order._id)}</Text>
          <Text style={[type.caption, { color: colors.inkMuted }]}>
            {orderDate(order.createdAt)}
          </Text>
        </View>
        <Badge label={order.orderStatus} tone={status.tone} icon={status.icon} />
      </View>

      {/* The thumbnails are the fastest way to recognise an order — far
          faster than reading a reference number. */}
      <View style={styles.thumbs}>
        {items.slice(0, 4).map((item, i) => (
          <Image
            key={`${item.product}-${i}`}
            source={item.image}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
            style={styles.thumb}
          />
        ))}
        {items.length > 4 ? (
          <View style={[styles.thumb, styles.thumbMore]}>
            <Text style={[type.captionMedium, { color: colors.inkSecondary }]}>
              +{items.length - 4}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardFoot}>
        <Text style={[type.small, { color: colors.inkSecondary, flex: 1 }]} numberOfLines={1}>
          {items.length} item{items.length === 1 ? '' : 's'}
          {items[0] ? ` · ${items[0].name}` : ''}
        </Text>
        <Text style={[type.priceSmall, { color: colors.ink }]}>
          {formatRupees(order.totalPrice)}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      </View>
    </Pressable>
  );
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, loading, error, refetch } = useAsync(() => orderApi.mine(), []);

  const orders = sortNewestFirst(data?.orders);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton name="arrow-back" label="Go back" color={colors.white} onPress={() => router.back()} />
        <Text style={[type.h2, { color: colors.white, flex: 1 }]}>My orders</Text>
        {orders.length ? (
          <Text style={[type.small, { color: colors.gold }]}>{orders.length}</Text>
        ) : null}
      </View>

      {loading && !data ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={160} borderRadius={radius.lg} />
          ))}
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => String(o._id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
          renderItem={({ item }) => <OrderCard order={item} />}
          refreshing={loading}
          onRefresh={refetch}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="No orders yet"
              message="Anything you buy will show up here, with its delivery status."
              actionLabel="Start shopping"
              onAction={() => router.push('/')}
            />
          }
        />
      )}
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
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumbs: { flexDirection: 'row', gap: spacing.sm },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  thumbMore: { alignItems: 'center', justifyContent: 'center' },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET - 20,
  },
});
