import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, spacing, type } from '../../theme';
import { Button, Input, Chip } from '../ui';
import {
  EMPTY_ADDRESS,
  ADDRESS_TYPES,
  validateAddress,
  toAddressPayload,
} from '../../utils/address';

// Re-exported so screens that render this form have one import for the form
// and its rules. The rules themselves live in utils/address.js, which has no
// JSX and therefore a runnable self-check.
export { EMPTY_ADDRESS, validateAddress, toAddressPayload } from '../../utils/address';

/**
 * The delivery address form.
 *
 * One component for adding and editing, and the single source of the
 * validation and payload rules — checkout imports both, so an address saved
 * here is always good enough to place an order with.
 *
 * The backend field is `name`; this keeps that spelling so there's nothing to
 * translate on the way out.
 */

export default function AddressForm({ initial, submitLabel = 'Save address', onSubmit, submitting }) {
  const [form, setForm] = useState({ ...EMPTY_ADDRESS, ...initial });
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async () => {
    const found = validateAddress(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setFailure(null);
    const result = await onSubmit(toAddressPayload(form));
    if (result && !result.ok) setFailure(result.error);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <Input
        label="Full name"
        required
        value={form.name}
        onChangeText={set('name')}
        error={errors.name}
        placeholder="Who is this delivery for?"
        autoCapitalize="words"
        textContentType="name"
      />
      <Input
        label="Phone number"
        required
        value={String(form.phoneNo ?? '')}
        onChangeText={(t) => set('phoneNo')(t.replace(/[^0-9]/g, ''))}
        error={errors.phoneNo}
        placeholder="10-digit mobile number"
        keyboardType="number-pad"
        maxLength={10}
        textContentType="telephoneNumber"
      />
      <Input
        label="Address"
        required
        value={form.address}
        onChangeText={set('address')}
        error={errors.address}
        placeholder="Flat, building, street, area"
        multiline
        textContentType="fullStreetAddress"
      />

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Input
            label="City"
            required
            value={form.city}
            onChangeText={set('city')}
            error={errors.city}
            placeholder="City"
            textContentType="addressCity"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="PIN code"
            required
            value={String(form.pincode ?? '')}
            onChangeText={(t) => set('pincode')(t.replace(/[^0-9]/g, ''))}
            error={errors.pincode}
            placeholder="6 digits"
            keyboardType="number-pad"
            maxLength={6}
            textContentType="postalCode"
          />
        </View>
      </View>

      <Input
        label="State"
        required
        value={form.state}
        onChangeText={set('state')}
        error={errors.state}
        placeholder="State"
        textContentType="addressState"
      />

      <Text style={[type.smallMedium, { color: colors.ink, marginBottom: spacing.sm }]}>
        Address type
      </Text>
      <View style={styles.types}>
        {ADDRESS_TYPES.map((t) => (
          <Chip
            key={t.value}
            label={t.label}
            selected={form.addressType === t.value}
            onPress={() => set('addressType')(t.value)}
          />
        ))}
      </View>

      {failure ? (
        <Text style={[type.small, styles.failure]}>{failure}</Text>
      ) : null}

      <Button title={submitLabel} onPress={submit} loading={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  types: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  failure: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
});
