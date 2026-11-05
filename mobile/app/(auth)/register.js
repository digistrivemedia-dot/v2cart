import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, type } from '../../src/theme';
import { Button, Input, IconButton } from '../../src/components/ui';
import { useAuthStore } from '../../src/store/authStore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const register = useAuthStore((s) => s.register);
  const submitting = useAuthStore((s) => s.submitting);

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Enter your name.';
    else if (form.name.trim().length < 2) next.name = 'That name looks too short.';

    if (!form.email.trim()) next.email = 'Enter your email.';
    else if (!EMAIL_RE.test(form.email)) next.email = 'Enter a valid email address.';

    if (!form.password) next.password = 'Choose a password.';
    else if (form.password.length < MIN_PASSWORD)
      next.password = `Use at least ${MIN_PASSWORD} characters.`;

    if (form.confirm !== form.password) next.confirm = "Passwords don't match.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setFailure(null);

    const result = await register({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
    });

    if (result.ok) {
      // Straight into the app — they signed up to buy something.
      router.replace('/');
    } else {
      setFailure(result.error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.nav, { paddingTop: insets.top + spacing.sm }]}>
        <IconButton name="arrow-back" label="Go back" onPress={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <Text style={[type.display, { color: colors.navy }]}>Create account</Text>
          <Text style={[type.body, { color: colors.inkSecondary }]}>
            It takes a minute, and your cart carries over.
          </Text>
        </View>

        <Input
          label="Full name"
          required
          value={form.name}
          onChangeText={set('name')}
          error={errors.name}
          placeholder="Your name"
          autoCapitalize="words"
          textContentType="name"
        />
        <Input
          label="Email"
          required
          value={form.email}
          onChangeText={set('email')}
          error={errors.email}
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Input
          label="Password"
          required
          value={form.password}
          onChangeText={set('password')}
          error={errors.password}
          helper={`At least ${MIN_PASSWORD} characters`}
          placeholder="Choose a password"
          secureTextEntry
          textContentType="newPassword"
        />
        <Input
          label="Confirm password"
          required
          value={form.confirm}
          onChangeText={set('confirm')}
          error={errors.confirm}
          placeholder="Re-enter your password"
          secureTextEntry
          textContentType="newPassword"
        />

        {failure ? (
          <View style={styles.failure}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={[type.small, { color: colors.danger, flex: 1 }]}>{failure}</Text>
          </View>
        ) : null}

        <Button title="Create account" onPress={submit} loading={submitting} />

        <Text style={[type.caption, styles.note]}>
          This app is for shopping. Vendor and investor accounts are created on the website.
        </Text>

        <View style={styles.footer}>
          <Text style={[type.small, { color: colors.inkSecondary }]}>Already have an account?</Text>
          <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8} accessibilityRole="button">
            <Text style={[type.smallMedium, { color: colors.accent }]}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  content: { padding: spacing.xl, paddingTop: spacing.lg },
  brand: { gap: spacing.sm, marginBottom: spacing.xl },
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
  },
  note: { color: colors.inkMuted, textAlign: 'center', marginTop: spacing.lg },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
});
