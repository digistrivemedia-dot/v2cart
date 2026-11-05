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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const login = useAuthStore((s) => s.login);
  const submitting = useAuthStore((s) => s.submitting);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);

  // Validate on blur, not on every keystroke — an error that appears while
  // you're still typing the second character is just noise.
  const validateEmail = () =>
    setErrors((e) => ({
      ...e,
      email: email && !EMAIL_RE.test(email) ? 'Enter a valid email address.' : undefined,
    }));

  const submit = async () => {
    const next = {};
    if (!email.trim()) next.email = 'Enter your email.';
    else if (!EMAIL_RE.test(email)) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setFailure(null);
    const result = await login(email.trim(), password);
    if (result.ok) {
      router.back();
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
        <IconButton name="close" label="Close" onPress={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <Text style={[type.display, { color: colors.navy }]}>Welcome back</Text>
          <Text style={[type.body, { color: colors.inkSecondary }]}>
            Sign in to check out and track your orders.
          </Text>
        </View>

        <Input
          label="Email"
          required
          value={email}
          onChangeText={setEmail}
          onBlur={validateEmail}
          error={errors.email}
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <Input
          label="Password"
          required
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          placeholder="Your password"
          secureTextEntry
          textContentType="password"
        />

        {failure ? (
          <View style={styles.failure}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={[type.small, { color: colors.danger, flex: 1 }]}>{failure}</Text>
          </View>
        ) : null}

        <Button title="Sign in" onPress={submit} loading={submitting} style={{ marginTop: spacing.sm }} />

        <View style={styles.footer}>
          <Text style={[type.small, { color: colors.inkSecondary }]}>Don&apos;t have an account?</Text>
          <Pressable
            onPress={() => router.replace('/(auth)/register')}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={[type.smallMedium, { color: colors.accent }]}>Create one</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  content: { padding: spacing.xl, paddingTop: spacing.lg },
  brand: { gap: spacing.sm, marginBottom: spacing.xxl },
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
});
