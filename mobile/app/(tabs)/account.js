import React, { useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, TOUCH_TARGET } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useWishlistStore } from '../../src/store/wishlistStore';
import { orderApi, authApi } from '../../src/api/endpoints';
import { useAsync } from '../../src/hooks/useAsync';
import { Badge, Divider, EmptyState, Skeleton } from '../../src/components/ui';
import { formatRupees } from '../../src/utils/pricing';
import { STATUS_TONE, orderRef, orderDate, sortNewestFirst } from '../../src/utils/orders';

function Row({ icon, label, value, onPress, danger }) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: colors.surfaceAlt }]}
    >
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.inkSecondary} />
      <Text style={[type.body, { color: danger ? colors.danger : colors.ink, flex: 1 }]}>{label}</Text>
      {value ? <Text style={[type.small, { color: colors.inkMuted }]}>{value}</Text> : null}
      {onPress && !danger ? (
        <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      ) : null}
    </Wrapper>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const logout = useAuthStore((s) => s.logout);

  // Only ask once we know there's a session to ask with.
  const orders = useAsync(() => orderApi.mine(), [user?._id], { immediate: Boolean(user) });
  // The store's user copy can be stale — an address added on the website
  // since sign-in wouldn't be in it.
  const profile = useAsync(() => authApi.me(), [user?._id], { immediate: Boolean(user) });

  const wishlistCount = useWishlistStore((s) => s.ids.size);
  const refreshWishlist = useWishlistStore((s) => s.refresh);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      refreshWishlist();
      orders.refetch();
      profile.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?._id])
  );

  const confirmLogout = () =>
    Alert.alert('Sign out?', 'You can sign back in any time. Your cart stays on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);

  if (bootstrapping) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + 60 }}>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={80} borderRadius={radius.lg} />
          <Skeleton height={140} borderRadius={radius.lg} />
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Text style={[type.h2, { color: colors.white }]}>Account</Text>
        </View>
        <EmptyState
          icon="person-circle-outline"
          title="You're browsing as a guest"
          message="Sign in to check out faster and see your orders."
          actionLabel="Sign in"
          onAction={() => router.push('/(auth)/login')}
        />
      </View>
    );
  }

  const myOrders = sortNewestFirst(orders.data?.orders);
  const addresses = profile.data?.user?.addresses ?? user.addresses ?? [];
  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={[type.h2, { color: colors.white }]}>Account</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={orders.loading || profile.loading}
            onRefresh={() => {
              orders.refetch();
              profile.refetch();
              refreshWishlist();
            }}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={[type.h2, { color: colors.white }]}>
              {(user.name || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.h3, { color: colors.ink }]} numberOfLines={1}>{user.name}</Text>
            <Text style={[type.small, { color: colors.inkSecondary }]} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
        </View>

        {/* ── Orders ── */}
        <View style={styles.group}>
          <Row
            icon="receipt-outline"
            label="My orders"
            value={myOrders.length ? String(myOrders.length) : undefined}
            onPress={() => router.push('/account/orders')}
          />
          {orders.loading && !orders.data ? (
            <>
              <Divider />
              <View style={{ padding: spacing.lg, gap: spacing.sm }}>
                <Skeleton height={18} />
                <Skeleton height={18} width="70%" />
              </View>
            </>
          ) : myOrders.length === 0 ? (
            <>
              <Divider />
              <Text style={[type.small, styles.emptyNote]}>
                No orders yet — anything you buy will show up here.
              </Text>
            </>
          ) : (
            // The three most recent, as a preview. The full history is one
            // tap away rather than scrolling this screen forever.
            myOrders.slice(0, 3).map((o) => {
              const status = STATUS_TONE[o.orderStatus] || STATUS_TONE.Pending;
              return (
                <View key={o._id}>
                  <Divider />
                  <Pressable
                    onPress={() => router.push(`/account/order/${o._id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Order ${orderRef(o._id)}, ${o.orderStatus}, ${formatRupees(o.totalPrice)}`}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.smallMedium, { color: colors.ink }]}>
                        {orderRef(o._id)} · {formatRupees(o.totalPrice)}
                      </Text>
                      <Text style={[type.caption, { color: colors.inkMuted }]}>
                        {orderDate(o.createdAt)}
                      </Text>
                    </View>
                    <Badge label={o.orderStatus} tone={status.tone} icon={status.icon} />
                    <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        {/* ── Wishlist ── */}
        <View style={styles.group}>
          <Row
            icon="heart-outline"
            label="Wishlist"
            value={wishlistCount ? `${wishlistCount} saved` : 'Nothing saved'}
            onPress={() => router.push('/account/wishlist')}
          />
        </View>

        {/* ── Addresses ── */}
        <View style={styles.group}>
          <Row
            icon="location-outline"
            label="Saved addresses"
            value={addresses.length ? String(addresses.length) : undefined}
            onPress={() => router.push('/account/addresses')}
          />
          <Divider />
          {profile.loading && !profile.data ? (
            <View style={{ padding: spacing.lg, gap: spacing.sm }}>
              <Skeleton height={18} />
              <Skeleton height={18} width="60%" />
            </View>
          ) : defaultAddress ? (
            <View style={{ padding: spacing.lg, gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={[type.smallMedium, { color: colors.ink }]}>
                  {defaultAddress.name}
                </Text>
                {defaultAddress.isDefault ? (
                  <Badge label="Default" tone="success" icon="checkmark-circle" />
                ) : null}
              </View>
              <Text style={[type.small, { color: colors.inkSecondary }]}>
                {defaultAddress.address}, {defaultAddress.city}, {defaultAddress.state}{' '}
                {defaultAddress.pincode}
              </Text>
            </View>
          ) : (
            <Text style={[type.small, styles.emptyNote]}>
              No saved addresses — add one and checkout becomes one tap.
            </Text>
          )}
        </View>

        {/* Sign out is separated from everything else — destructive actions
            don't sit flush against ordinary rows. */}
        <View style={styles.group}>
          <Row icon="log-out-outline" label="Sign out" onPress={confirmLogout} danger />
        </View>

        <Text style={[type.caption, { color: colors.inkMuted, textAlign: 'center' }]}>
          Investing, selling and admin tools live on the website.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.navy,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  groupTitle: { color: colors.inkSecondary, padding: spacing.lg, paddingBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TOUCH_TARGET + 8,
    paddingHorizontal: spacing.lg,
  },
  emptyNote: { color: colors.inkMuted, padding: spacing.lg },
});
