import React, { useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type } from '../../src/theme';
import { useCartStore } from '../../src/store/cartStore';
import { useSettingsStore, FALLBACK_GST_PCT } from '../../src/store/settingsStore';
import { Button, QuantityStepper, EmptyState, Divider } from '../../src/components/ui';
import { formatRupees, unitPrice, FREE_SHIPPING_OVER } from '../../src/utils/pricing';

function Line({ item, onQuantity, onRemove }) {
  const price = unitPrice(item.product, item.variant);
  const variantLabel = [item.variant?.color, item.variant?.size].filter(Boolean).join(' · ');

  return (
    <View style={styles.line}>
      <Image
        source={item.product.images?.[0]?.url}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        style={styles.thumb}
      />

      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={2}>
          {item.product.name}
        </Text>
        {variantLabel ? (
          <Text style={[type.caption, { color: colors.inkMuted }]}>{variantLabel}</Text>
        ) : null}
        <Text style={[type.priceSmall, { color: colors.accent }]}>{formatRupees(price)}</Text>

        <View style={styles.lineControls}>
          <QuantityStepper
            value={item.quantity}
            onChange={(q) => onQuantity(item.key, q)}
            max={Math.max(Number(item.product.stock) || 1, 1)}
          />
          <Pressable
            onPress={() => onRemove(item.key)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.product.name} from cart`}
            style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SummaryRow({ label, value, emphasis, hint }) {
  return (
    <View style={styles.summaryRow}>
      <View style={{ flex: 1 }}>
        <Text style={[emphasis ? type.bodyMedium : type.small, { color: emphasis ? colors.ink : colors.inkSecondary }]}>
          {label}
        </Text>
        {hint ? <Text style={[type.caption, { color: colors.success }]}>{hint}</Text> : null}
      </View>
      <Text
        style={[
          emphasis ? type.priceSmall : type.smallMedium,
          { color: emphasis ? colors.accent : colors.ink },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const refresh = useCartStore((s) => s.refresh);
  const syncing = useCartStore((s) => s.syncing);
  const totals = useCartStore((s) => s.totals)();
  const gstPct = useSettingsStore((s) => s.gstPct) ?? FALLBACK_GST_PCT;

  // The same cart is editable from the website, so re-read it whenever this
  // tab comes forward — otherwise a basket changed in a browser looks stale
  // here until the app restarts.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Text style={[type.h2, { color: colors.white }]}>Cart</Text>
        </View>
        <FlatList
          data={[]}
          renderItem={null}
          refreshControl={
            <RefreshControl refreshing={syncing} onRefresh={refresh} tintColor={colors.accent} />
          }
          contentContainerStyle={{ flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              icon="bag-outline"
              title="Your cart is empty"
              message="Browse the catalogue and add something you like."
              actionLabel="Start shopping"
              onAction={() => router.push('/')}
            />
          }
        />
      </View>
    );
  }

  const awayFromFreeShipping = FREE_SHIPPING_OVER - totals.itemsPrice;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={[type.h2, { color: colors.white, flex: 1 }]}>Cart</Text>
        <Text style={[type.small, { color: colors.gold }]}>
          {totals.itemCount} item{totals.itemCount === 1 ? '' : 's'}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={syncing} onRefresh={refresh} tintColor={colors.accent} />
        }
        ItemSeparatorComponent={() => <Divider style={{ marginVertical: spacing.md }} />}
        renderItem={({ item }) => <Line item={item} onQuantity={setQuantity} onRemove={remove} />}
        ListFooterComponent={
          <View style={styles.summary}>
            <SummaryRow label="Items" value={formatRupees(totals.itemsPrice, { decimals: true })} />
            <SummaryRow
              label={`Tax (${gstPct}%)`}
              value={formatRupees(totals.taxPrice, { decimals: true })}
            />
            <SummaryRow
              label="Shipping"
              value={totals.shippingPrice === 0 ? 'Free' : formatRupees(totals.shippingPrice)}
              hint={
                totals.shippingPrice > 0 && awayFromFreeShipping > 0
                  ? `Add ${formatRupees(awayFromFreeShipping)} for free shipping`
                  : undefined
              }
            />
            <Divider style={{ marginVertical: spacing.md }} />
            <SummaryRow label="Total" value={formatRupees(totals.total, { decimals: true })} emphasis />
          </View>
        }
      />

      <View style={[styles.checkoutBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.inkMuted }]}>Total</Text>
          <Text style={[type.priceSmall, { color: colors.ink }]}>
            {formatRupees(totals.total, { decimals: true })}
          </Text>
        </View>
        <Button
          title="Checkout"
          icon="arrow-forward"
          onPress={() => router.push('/checkout')}
          fullWidth={false}
          style={{ flex: 1.3 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.navy,
  },
  line: { flexDirection: 'row', gap: spacing.md },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  lineControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  removeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 5 },
  checkoutBar: {
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
