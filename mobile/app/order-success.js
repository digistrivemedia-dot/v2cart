import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type } from '../src/theme';
import { Button } from '../src/components/ui';

/**
 * Order confirmation. Reached with `replace`, and the back gesture is
 * disabled on this route (see app/_layout.js) — swiping back into a checkout
 * form for an order that already exists would invite a double purchase.
 */
export default function OrderSuccessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orderId } = useLocalSearchParams();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.body}>
        <View style={styles.tick}>
          <Ionicons name="checkmark" size={44} color={colors.white} />
        </View>

        <Text style={[type.h1, styles.center]}>Order placed</Text>
        <Text style={[type.body, styles.message]}>
          Thanks — we&apos;ve got your order and you&apos;ll get a confirmation email shortly.
        </Text>

        {orderId ? (
          <View style={styles.idPill}>
            <Text style={[type.caption, { color: colors.inkSecondary }]}>Order ID</Text>
            <Text style={[type.smallMedium, { color: colors.ink }]}>
              #{String(orderId).slice(-8).toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button title="View my orders" onPress={() => router.replace('/account')} />
        <Button title="Keep shopping" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  tick: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  center: { color: colors.ink, textAlign: 'center' },
  message: { color: colors.inkSecondary, textAlign: 'center' },
  idPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  actions: { padding: spacing.xl, gap: spacing.md },
});
