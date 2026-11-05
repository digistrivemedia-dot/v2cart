import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, TOUCH_TARGET } from '../src/theme';
import { useCartStore } from '../src/store/cartStore';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore, FALLBACK_GST_PCT } from '../src/store/settingsStore';
import { orderApi, paymentApi, authApi, addressApi } from '../src/api/endpoints';
import { Button, Input, Badge, Divider, Skeleton, IconButton } from '../src/components/ui';
import { formatRupees } from '../src/utils/pricing';
import {
  EMPTY_ADDRESS,
  validateAddress,
  toAddressPayload,
  isSavedAlready,
  preferredAddress,
} from '../src/utils/address';

/**
 * Checkout.
 *
 * Auth wall sits here rather than at browse: intent is highest at this point,
 * so a sign-in prompt reads as expected instead of hostile.
 *
 * ── Addresses ──────────────────────────────────────────────────────────────
 *
 * Saved addresses are offered first and the default one is pre-selected, so a
 * returning customer places an order without typing anything. The form is
 * only shown when there is nothing saved, or when "Use a new address" is
 * picked explicitly.
 *
 * A newly typed address is saved to the address book after the order goes
 * through — it used to go only into the order's `shippingInfo`, which is why
 * an address entered here never appeared under saved addresses.
 *
 * Payment honours the backend's PAYMENTS_MOCK flag exactly as the web does —
 * when the order response says `mock`, the gateway step is skipped and the
 * supplied proof is submitted straight through. That keeps the whole flow
 * testable without a live Razorpay account.
 */

const TYPE_ICONS = { home: 'home-outline', work: 'briefcase-outline', other: 'location-outline' };

function SavedAddress({ address, selected, onSelect }) {
  return (
    <Pressable
      onPress={() => onSelect(address._id)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`Deliver to ${address.name}, ${address.address}, ${address.city}`}
      style={({ pressed }) => [
        styles.pickCard,
        selected && styles.pickCardOn,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons
            name={TYPE_ICONS[address.addressType] || TYPE_ICONS.other}
            size={14}
            color={colors.accentDark}
          />
          <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={1}>
            {address.name}
          </Text>
          {address.isDefault ? <Badge label="Default" tone="success" /> : null}
        </View>
        <Text style={[type.small, { color: colors.inkSecondary }]}>
          {address.address}, {address.city}, {address.state} {address.pincode}
        </Text>
        <Text style={[type.caption, { color: colors.inkMuted }]}>{address.phoneNo}</Text>
      </View>
    </Pressable>
  );
}

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const items = useCartStore((s) => s.items);
  const totals = useCartStore((s) => s.totals)();
  const toOrderItems = useCartStore((s) => s.toOrderItems);
  const clearCart = useCartStore((s) => s.clear);

  // The backend stores the totalPrice this screen sends, so the GST rate has
  // to be the real one before anything is charged — not the display fallback.
  const gstPct = useSettingsStore((s) => s.gstPct);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const loadSettings = useSettingsStore((s) => s.load);

  const [saved, setSaved] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  /** 'saved' delivers to `selectedId`; 'new' delivers to `form`. */
  const [mode, setMode] = useState('saved');
  const [saveToBook, setSaveToBook] = useState(true);

  const [form, setForm] = useState({ ...EMPTY_ADDRESS, name: user?.name ?? '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState(null);

  // Saved addresses live on the user document and are read through /me.
  useEffect(() => {
    if (!user) {
      setLoadingSaved(false);
      return;
    }
    authApi
      .me()
      .then(({ user: fresh }) => {
        const list = fresh.addresses ?? [];
        setSaved(list);
        const preferred = preferredAddress(list);
        setSelectedId(preferred?._id ?? null);
        // Nothing saved means the form is the only option — don't make
        // someone tap "use a new address" to reach the only path available.
        setMode(list.length ? 'saved' : 'new');
      })
      .catch(() => setMode('new'))
      .finally(() => setLoadingSaved(false));
  }, [user?._id]);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  /** The address this order ships to, in the saved-address shape. */
  const chosen =
    mode === 'saved' ? saved.find((a) => a._id === selectedId) : { ...form, country: 'India' };

  const placeOrder = async () => {
    setFailure(null);

    if (mode === 'saved' && !chosen) {
      setFailure('Choose a delivery address first.');
      return;
    }

    if (mode === 'new') {
      const found = validateAddress(form);
      setErrors(found);
      if (Object.keys(found).length) return;
    }

    setSubmitting(true);

    try {
      // 0. The order total includes GST, and the amount charged is whatever
      //    this screen computes — so a rate that never loaded would under- or
      //    over-charge. Fetch it before taking money, and stop if it fails.
      if (!settingsLoaded) {
        const loaded = await loadSettings();
        if (!loaded.ok) {
          throw new Error(
            "Couldn't confirm the current tax rate. Check your connection and try again."
          );
        }
      }

      // 1. Ask the SERVER what this cart costs.
      //
      //    Phase 23 — /order/new recomputes the total from the database and
      //    verifies the payment covers it. Charging the figure this screen
      //    computed risks a mismatch (an admin changing the shipping fee, a
      //    stale cached price) that refuses the order after the customer has
      //    already paid. So the amount charged comes from the server.
      const quoted = await orderApi.quote(
        toOrderItems().map((i) => ({ product: i.product, quantity: i.quantity }))
      );

      if (quoted.unavailable?.length) {
        throw new Error(`Out of stock: ${quoted.unavailable.join(', ')}`);
      }

      const payable = quoted.quote.total;

      // 2. Ask the backend to open a payment for exactly that.
      const orderResponse = await paymentApi.createOrder(payable, { purpose: 'order' });

      let proof;
      if (orderResponse.mock) {
        // Mock mode: the backend already handed us a valid proof.
        proof = orderResponse.mockPayment;
      } else {
        // A real gateway needs Razorpay's checkout, which is a web/native SDK
        // this build doesn't embed yet. Fail loudly rather than silently
        // creating an unpaid order.
        throw new Error(
          'Live card payments are not available in this build yet. Ask the team to enable PAYMENTS_MOCK for testing.'
        );
      }

      // 3. Verify, exactly as the web does, before creating the order.
      await paymentApi.verify(proof);

      // 4. Create the order. Every price, the tax, the shipping and the total
      //    are recomputed server-side, so only the product ids and quantities
      //    here are load-bearing.
      const { order } = await orderApi.create({
        shippingInfo: {
          address: String(chosen.address).trim(),
          city: String(chosen.city).trim(),
          state: String(chosen.state).trim(),
          country: chosen.country || 'India',
          pincode: Number(chosen.pincode),
          phoneNo: Number(chosen.phoneNo),
        },
        orderItems: toOrderItems(),
        paymentInfo: { id: proof.razorpay_payment_id, status: 'succeeded' },
      });

      // 5. Keep the address, if it's new and they asked us to.
      //
      //    Deliberately after the order and deliberately best-effort: the
      //    order is the thing that matters, and a failed save must not turn a
      //    paid order into an error screen.
      if (mode === 'new' && saveToBook && !isSavedAlready(saved, form)) {
        await addressApi.add(toAddressPayload(form)).catch(() => {});
      }

      // Awaited: the cart now lives on the server, and leaving before the
      // clear lands would show the old basket on the website.
      await clearCart();
      router.replace({ pathname: '/order-success', params: { orderId: order?._id ?? '' } });
    } catch (err) {
      setFailure(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ----------------------------- guards ----------------------------- */

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        <View style={styles.navRow}>
          <IconButton name="arrow-back" label="Go back" onPress={() => router.back()} />
          <Text style={[type.h3, { color: colors.ink }]}>Checkout</Text>
        </View>
        <View style={styles.gate}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.inkMuted} />
          <Text style={[type.h2, { color: colors.ink, textAlign: 'center' }]}>Sign in to check out</Text>
          <Text style={[type.small, { color: colors.inkSecondary, textAlign: 'center' }]}>
            Your cart is saved — you&apos;ll come straight back here.
          </Text>
          <Button title="Sign in" onPress={() => router.push('/(auth)/login')} />
          <Button
            title="Create an account"
            variant="secondary"
            onPress={() => router.push('/(auth)/register')}
          />
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        <View style={styles.navRow}>
          <IconButton name="arrow-back" label="Go back" onPress={() => router.back()} />
          <Text style={[type.h3, { color: colors.ink }]}>Checkout</Text>
        </View>
        <View style={styles.gate}>
          <Text style={[type.body, { color: colors.inkSecondary }]}>There&apos;s nothing to check out.</Text>
          <Button title="Browse products" onPress={() => router.replace('/')} />
        </View>
      </View>
    );
  }

  /* ------------------------------ form ------------------------------ */

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.navRow, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton name="arrow-back" label="Go back" onPress={() => router.back()} />
        <Text style={[type.h3, { color: colors.ink }]}>Checkout</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[type.h3, { color: colors.ink, marginBottom: spacing.md }]}>
          Delivery address
        </Text>

        {loadingSaved ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={90} borderRadius={radius.lg} />
            <Skeleton height={90} borderRadius={radius.lg} />
          </View>
        ) : null}

        {/* Saved addresses first — the whole point of saving one. */}
        {!loadingSaved && saved.length ? (
          <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            {saved.map((a) => (
              <SavedAddress
                key={a._id}
                address={a}
                selected={mode === 'saved' && selectedId === a._id}
                onSelect={(id) => {
                  setSelectedId(id);
                  setMode('saved');
                  setFailure(null);
                }}
              />
            ))}

            <Pressable
              onPress={() => setMode(mode === 'new' ? 'saved' : 'new')}
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === 'new' }}
              accessibilityLabel="Deliver to a new address"
              style={({ pressed }) => [
                styles.pickCard,
                mode === 'new' && styles.pickCardOn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={[styles.radio, mode === 'new' && styles.radioOn]}>
                {mode === 'new' ? <View style={styles.radioDot} /> : null}
              </View>
              <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
              <Text style={[type.smallMedium, { color: colors.ink, flex: 1 }]}>
                Use a new address
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* The form, when there's nothing saved or a new address was chosen. */}
        {!loadingSaved && mode === 'new' ? (
          <View>
            <Input
              label="Full name"
              required
              value={form.name}
              onChangeText={set('name')}
              error={errors.name}
              autoCapitalize="words"
              textContentType="name"
            />
            <Input
              label="Phone number"
              required
              value={form.phoneNo}
              onChangeText={(t) => set('phoneNo')(t.replace(/[^0-9]/g, '').slice(0, 10))}
              error={errors.phoneNo}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              placeholder="10 digits"
            />
            <Input
              label="Address"
              required
              value={form.address}
              onChangeText={set('address')}
              error={errors.address}
              autoCapitalize="sentences"
              textContentType="fullStreetAddress"
              multiline
              placeholder="House number, street, area"
            />

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="City"
                  required
                  value={form.city}
                  onChangeText={set('city')}
                  error={errors.city}
                  autoCapitalize="words"
                  textContentType="addressCity"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="State"
                  required
                  value={form.state}
                  onChangeText={set('state')}
                  error={errors.state}
                  autoCapitalize="words"
                  textContentType="addressState"
                />
              </View>
            </View>

            <Input
              label="PIN code"
              required
              value={form.pincode}
              onChangeText={(t) => set('pincode')(t.replace(/[^0-9]/g, '').slice(0, 6))}
              error={errors.pincode}
              keyboardType="number-pad"
              textContentType="postalCode"
              placeholder="6 digits"
            />

            {/* On by default: someone typing an address here almost always
                wants it next time, and that is what used to be lost. */}
            <Pressable
              onPress={() => setSaveToBook((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: saveToBook }}
              accessibilityLabel="Save this address for next time"
              style={({ pressed }) => [styles.saveToggle, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.checkbox, saveToBook && styles.checkboxOn]}>
                {saveToBook ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
              </View>
              <Text style={[type.small, { color: colors.ink, flex: 1 }]}>
                Save this address for next time
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.summary}>
          <Text style={[type.h3, { color: colors.ink, marginBottom: spacing.sm }]}>Order summary</Text>
          {items.map((i) => (
            <View key={i.key} style={styles.summaryLine}>
              <Text style={[type.small, { color: colors.inkSecondary, flex: 1 }]} numberOfLines={1}>
                {i.product.name} × {i.quantity}
              </Text>
              <Text style={[type.smallMedium, { color: colors.ink }]}>
                {formatRupees(i.product.price * i.quantity)}
              </Text>
            </View>
          ))}
          <Divider style={{ marginVertical: spacing.md }} />
          <View style={styles.summaryLine}>
            <Text style={[type.small, { color: colors.inkSecondary, flex: 1 }]}>
              Tax ({gstPct ?? FALLBACK_GST_PCT}%)
            </Text>
            <Text style={[type.smallMedium, { color: colors.ink }]}>
              {formatRupees(totals.taxPrice, { decimals: true })}
            </Text>
          </View>
          <View style={styles.summaryLine}>
            <Text style={[type.small, { color: colors.inkSecondary, flex: 1 }]}>Shipping</Text>
            <Text style={[type.smallMedium, { color: colors.ink }]}>
              {totals.shippingPrice === 0 ? 'Free' : formatRupees(totals.shippingPrice)}
            </Text>
          </View>
          <Divider style={{ marginVertical: spacing.md }} />
          <View style={styles.summaryLine}>
            <Text style={[type.bodyMedium, { color: colors.ink, flex: 1 }]}>Total</Text>
            <Text style={[type.priceSmall, { color: colors.accent }]}>
              {formatRupees(totals.total, { decimals: true })}
            </Text>
          </View>
        </View>

        {failure ? (
          <View style={styles.failure}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={[type.small, { color: colors.danger, flex: 1 }]}>{failure}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.payBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          title={`Place order · ${formatRupees(totals.total)}`}
          onPress={placeOrder}
          loading={submitting}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
  pickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TOUCH_TARGET + 16,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickCardOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.accent },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  saveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  summary: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  payBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
