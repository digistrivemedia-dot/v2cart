import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type } from '../../../src/theme';
import { orderApi } from '../../../src/api/endpoints';
import { useAsync } from '../../../src/hooks/useAsync';
import { Badge, ErrorState, Skeleton, Divider, IconButton } from '../../../src/components/ui';
import { formatRupees } from '../../../src/utils/pricing';
import { STATUS_TONE, ORDER_STAGES, orderRef, orderDate } from '../../../src/utils/orders';

/**
 * One order: where it is, what's in it, where it's going, what it cost.
 *
 * The status timeline comes from the order's own `statusHistory`, which the
 * backend appends to on every admin status change — so it is the real
 * sequence of events, not a guess from the current status.
 */

function SummaryRow({ label, value, emphasis, tone }) {
  return (
    <View style={styles.summaryRow}>
      <Text
        style={[
          emphasis ? type.bodyMedium : type.small,
          { color: emphasis ? colors.ink : colors.inkSecondary, flex: 1 },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          emphasis ? type.priceSmall : type.smallMedium,
          { color: tone || (emphasis ? colors.accent : colors.ink) },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Progress through the fulfilment stages.
 *
 * A cancelled order doesn't belong on this track — showing it part-way along
 * a line that ends in "Delivered" implies it's still coming.
 */
function Timeline({ order }) {
  if (order.orderStatus === 'Cancelled') {
    return (
      <View style={styles.cancelled}>
        <Ionicons name="close-circle" size={18} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={[type.smallMedium, { color: colors.danger }]}>
            Cancelled {order.cancelledAt ? `on ${orderDate(order.cancelledAt)}` : ''}
          </Text>
          {order.cancellationReason ? (
            <Text style={[type.small, { color: colors.inkSecondary }]}>
              {order.cancellationReason}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  const reached = ORDER_STAGES.indexOf(order.orderStatus);
  const history = order.statusHistory || [];

  return (
    <View>
      {ORDER_STAGES.map((stage, i) => {
        const done = reached >= i;
        const at = history.find((h) => h.status === stage)?.timestamp;

        return (
          <View key={stage} style={styles.stage}>
            <View style={styles.stageRail}>
              <View style={[styles.stageDot, done && styles.stageDotOn]}>
                {done ? <Ionicons name="checkmark" size={11} color={colors.white} /> : null}
              </View>
              {i < ORDER_STAGES.length - 1 ? (
                <View style={[styles.stageLine, reached > i && styles.stageLineOn]} />
              ) : null}
            </View>

            <View style={{ flex: 1, paddingBottom: spacing.lg }}>
              <Text
                style={[
                  type.smallMedium,
                  { color: done ? colors.ink : colors.inkMuted },
                ]}
              >
                {stage}
              </Text>
              {at ? (
                <Text style={[type.caption, { color: colors.inkMuted }]}>{orderDate(at)}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, loading, error, refetch } = useAsync(() => orderApi.detail(id), [id]);
  const order = data?.order;

  const header = (title) => (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <IconButton name="arrow-back" label="Go back" color={colors.white} onPress={() => router.back()} />
      <Text style={[type.h2, { color: colors.white, flex: 1 }]}>{title}</Text>
    </View>
  );

  if (loading && !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        {header('Order')}
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={120} borderRadius={radius.lg} />
          <Skeleton height={200} borderRadius={radius.lg} />
        </View>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        {header('Order')}
        <ErrorState message={error || 'That order could not be found.'} onRetry={refetch} />
      </View>
    );
  }

  const status = STATUS_TONE[order.orderStatus] || STATUS_TONE.Pending;
  const ship = order.shippingInfo || {};
  const items = order.orderItems || [];

  /**
   * The breakdown is derived, not stored.
   *
   * The order schema keeps only `totalPrice` and `discountAmount` — checkout
   * sends itemsPrice/taxPrice/shippingPrice and the backend discards them. So
   * the line items give the subtotal and whatever is left of the total is tax
   * and delivery. Reading the unstored fields would have printed three empty
   * rows; this way the breakdown always reconciles to what was charged.
   */
  const itemsSubtotal = items.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
  const taxAndDelivery = Math.max(
    0,
    Number(order.totalPrice || 0) - itemsSubtotal + Number(order.discountAmount || 0)
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {header(orderRef(order._id))}

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { color: colors.inkMuted }]}>Placed on</Text>
              <Text style={[type.bodyMedium, { color: colors.ink }]}>
                {orderDate(order.createdAt)}
              </Text>
            </View>
            <Badge label={order.orderStatus} tone={status.tone} icon={status.icon} />
          </View>

          <Divider style={{ marginVertical: spacing.md }} />
          <Timeline order={order} />
        </View>

        <View style={styles.card}>
          <Text style={[type.h3, { color: colors.ink, marginBottom: spacing.md }]}>
            {items.length} item{items.length === 1 ? '' : 's'}
          </Text>

          {items.map((item, i) => (
            <Pressable
              key={`${item.product}-${i}`}
              onPress={() => item.product && router.push(`/product/${item.product}`)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, quantity ${item.quantity}`}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
            >
              <Image
                source={item.image}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
                style={styles.itemThumb}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={[type.caption, { color: colors.inkMuted }]}>
                  Qty {item.quantity} · {formatRupees(item.price)} each
                </Text>
              </View>
              <Text style={[type.smallMedium, { color: colors.ink }]}>
                {formatRupees(item.price * item.quantity)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={[type.h3, { color: colors.ink, marginBottom: spacing.sm }]}>
            Delivery address
          </Text>
          <Text style={[type.small, { color: colors.inkSecondary }]}>
            {ship.address}
            {'\n'}
            {ship.city}, {ship.state} {ship.pincode}
            {'\n'}
            {ship.country}
            {ship.phoneNo ? `\n${ship.phoneNo}` : ''}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={[type.h3, { color: colors.ink, marginBottom: spacing.sm }]}>Payment</Text>
          <SummaryRow label="Items" value={formatRupees(itemsSubtotal, { decimals: true })} />
          {order.discountAmount > 0 ? (
            <SummaryRow
              label={order.couponCode ? `Discount (${order.couponCode})` : 'Discount'}
              value={`−${formatRupees(order.discountAmount, { decimals: true })}`}
              tone={colors.success}
            />
          ) : null}
          {taxAndDelivery > 0 ? (
            <SummaryRow label="Tax & delivery" value={formatRupees(taxAndDelivery, { decimals: true })} />
          ) : null}
          <Divider style={{ marginVertical: spacing.sm }} />
          <SummaryRow
            label="Total paid"
            value={formatRupees(order.totalPrice, { decimals: true })}
            emphasis
          />
          {order.paidAt ? (
            <Text style={[type.caption, { color: colors.inkMuted, marginTop: spacing.sm }]}>
              Paid on {orderDate(order.paidAt)}
            </Text>
          ) : null}
        </View>
      </ScrollView>
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  itemThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  stage: { flexDirection: 'row', gap: spacing.md },
  stageRail: { alignItems: 'center', width: 18 },
  stageDot: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageDotOn: { backgroundColor: colors.success, borderColor: colors.success },
  stageLine: { flex: 1, width: 2, backgroundColor: colors.border },
  stageLineOn: { backgroundColor: colors.success },
  cancelled: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
});
