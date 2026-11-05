import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, TOUCH_TARGET } from '../../src/theme';
import { addressApi, authApi } from '../../src/api/endpoints';
import { useAuthStore } from '../../src/store/authStore';
import { Button, Badge, EmptyState, ErrorState, Skeleton, Divider, IconButton } from '../../src/components/ui';
import AddressForm from '../../src/components/account/AddressForm';

/**
 * Saved delivery addresses.
 *
 * The list comes from the user document rather than its own endpoint, and
 * every mutation answers with the whole array — so this holds the array in
 * state and replaces it on each response instead of refetching.
 */

const TYPE_ICONS = { home: 'home-outline', work: 'briefcase-outline', other: 'location-outline' };

function AddressCard({ address, onEdit, onDelete, onMakeDefault }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Ionicons
          name={TYPE_ICONS[address.addressType] || TYPE_ICONS.other}
          size={18}
          color={colors.accentDark}
        />
        <Text style={[type.bodyMedium, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
          {address.name}
        </Text>
        {address.isDefault ? <Badge label="Default" tone="success" icon="checkmark-circle" /> : null}
      </View>

      <Text style={[type.small, { color: colors.inkSecondary }]}>
        {address.address}
        {'\n'}
        {address.city}, {address.state} {address.pincode}
        {'\n'}
        {address.country || 'India'} · {address.phoneNo}
      </Text>

      <Divider style={{ marginVertical: spacing.md }} />

      <View style={styles.actions}>
        {!address.isDefault ? (
          <Pressable
            onPress={() => onMakeDefault(address)}
            accessibilityRole="button"
            accessibilityLabel={`Make ${address.name} the default address`}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="star-outline" size={16} color={colors.accent} />
            <Text style={[type.smallMedium, { color: colors.accent }]}>Set default</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <Pressable
          onPress={() => onEdit(address)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${address.name}`}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="create-outline" size={16} color={colors.inkSecondary} />
          <Text style={[type.smallMedium, { color: colors.inkSecondary }]}>Edit</Text>
        </Pressable>

        <Pressable
          onPress={() => onDelete(address)}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${address.name}`}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={[type.smallMedium, { color: colors.danger }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [addresses, setAddresses] = useState(user?.addresses ?? []);
  const [loading, setLoading] = useState(!user?.addresses);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // address object, or 'new'
  const [submitting, setSubmitting] = useState(false);

  // `/me` is the only read for addresses, and the store's copy can be stale
  // if one was added on the website since sign-in.
  const load = async () => {
    setError(null);
    try {
      const { user: fresh } = await authApi.me();
      setAddresses(fresh.addresses ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (payload) => {
    setSubmitting(true);
    try {
      const data =
        editing === 'new'
          ? await addressApi.add(payload)
          : await addressApi.update(editing._id, payload);
      setAddresses(data.addresses ?? []);
      setEditing(null);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      setSubmitting(false);
    }
  };

  const remove = (address) =>
    Alert.alert('Delete this address?', `${address.name}, ${address.city}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const data = await addressApi.remove(address._id);
            setAddresses(data.addresses ?? []);
          } catch (err) {
            setError(err.message);
          }
        },
      },
    ]);

  const makeDefault = async (address) => {
    try {
      const data = await addressApi.setDefault(address._id);
      setAddresses(data.addresses ?? []);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton name="arrow-back" label="Go back" color={colors.white} onPress={() => router.back()} />
        <Text style={[type.h2, { color: colors.white, flex: 1 }]}>Saved addresses</Text>
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={150} borderRadius={radius.lg} />
          <Skeleton height={150} borderRadius={radius.lg} />
        </View>
      ) : error && !addresses.length ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {addresses.length === 0 ? (
            <EmptyState
              icon="location-outline"
              title="No saved addresses"
              message="Save an address now and checkout becomes one tap."
              actionLabel="Add an address"
              onAction={() => setEditing('new')}
            />
          ) : (
            <>
              {addresses.map((a) => (
                <AddressCard
                  key={a._id}
                  address={a}
                  onEdit={setEditing}
                  onDelete={remove}
                  onMakeDefault={makeDefault}
                />
              ))}
              <Button title="Add another address" icon="add" onPress={() => setEditing('new')} />
            </>
          )}

          {error ? <Text style={[type.small, styles.inlineError]}>{error}</Text> : null}
        </ScrollView>
      )}

      <Modal
        visible={Boolean(editing)}
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.surface }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
            <IconButton
              name="close"
              label="Cancel"
              color={colors.white}
              onPress={() => setEditing(null)}
            />
            <Text style={[type.h2, { color: colors.white, flex: 1 }]}>
              {editing === 'new' ? 'Add address' : 'Edit address'}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: spacing.lg }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Remounted per address, so the form's own state always starts
                from the record being edited. */}
            {editing ? (
              <AddressForm
                key={editing === 'new' ? 'new' : editing._id}
                initial={editing === 'new' ? undefined : editing}
                submitLabel={editing === 'new' ? 'Save address' : 'Save changes'}
                submitting={submitting}
                onSubmit={save}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
    gap: spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: TOUCH_TARGET - 12,
  },
  inlineError: { color: colors.danger, textAlign: 'center' },
});
