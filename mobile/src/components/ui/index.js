import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Animated,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, type, shadow, TOUCH_TARGET, duration } from '../../theme';

/**
 * Themed primitives. Every screen builds from these so spacing, radii, press
 * feedback and touch targets stay consistent without each screen re-deciding.
 *
 * Rules baked in rather than left to callers:
 *  • every tappable thing is >= 44pt and gives feedback inside ~100ms
 *  • icon-only controls require an accessibilityLabel
 *  • disabled is visually distinct AND actually non-interactive
 *  • press feedback is opacity/scale only — never a layout shift
 */

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  fullWidth = true,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  const animate = (to) =>
    Animated.timing(scale, {
      toValue: to,
      duration: duration.fast,
      useNativeDriver: true,
    }).start();

  const palette = {
    primary: { bg: colors.accent, bgPressed: colors.accentDark, fg: colors.white, border: 'transparent' },
    dark: { bg: colors.navy, bgPressed: colors.navyDark, fg: colors.white, border: 'transparent' },
    secondary: { bg: colors.surface, bgPressed: colors.surfaceAlt, fg: colors.ink, border: colors.borderStrong },
    ghost: { bg: 'transparent', bgPressed: colors.surfaceAlt, fg: colors.accent, border: 'transparent' },
    danger: { bg: colors.danger, bgPressed: '#b91c1c', fg: colors.white, border: 'transparent' },
  }[variant];

  const height = size === 'sm' ? TOUCH_TARGET : size === 'lg' ? 56 : 50;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && { width: '100%' }, style]}>
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={({ pressed }) => [
          styles.button,
          {
            height,
            backgroundColor: pressed ? palette.bgPressed : palette.bg,
            borderColor: palette.border,
            opacity: isDisabled ? 0.45 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <View style={styles.buttonInner}>
            {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
            <Text style={[type.bodyMedium, { color: palette.fg }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* IconButton — label is required, not optional                        */
/* ------------------------------------------------------------------ */

export function IconButton({ name, onPress, label, size = 22, color = colors.ink, badge, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }, style]}
    >
      <Ionicons name={name} size={size} color={color} />
      {badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Input — visible label, error under the field                        */
/* ------------------------------------------------------------------ */

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  helper,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  textContentType,
  onBlur,
  multiline,
  required,
}) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? (
        <Text style={[type.smallMedium, { color: colors.inkSecondary, marginBottom: spacing.xs }]}>
          {label}
          {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputWrap,
          focused && { borderColor: colors.accent },
          Boolean(error) && { borderColor: colors.danger },
          multiline && { height: 110, alignItems: 'flex-start', paddingVertical: spacing.md },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkMuted}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          textContentType={textContentType}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[type.body, styles.input, multiline && { height: '100%' }]}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Error replaces helper text — never stack both. Icon + text, so the
          failure doesn't depend on the red alone. */}
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <Text style={[type.caption, { color: colors.danger, flex: 1 }]}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={[type.caption, { color: colors.inkMuted, marginTop: spacing.xs }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Price                                                               */
/* ------------------------------------------------------------------ */

export function Price({ value, cutted, size = 'md', style }) {
  const t = size === 'lg' ? type.price : type.priceSmall;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }, style]}>
      <Text style={[t, { color: colors.accent }]}>
        ₹{Number(value || 0).toLocaleString('en-IN')}
      </Text>
      {cutted > value ? (
        // Shrinks and truncates rather than pushing the row wider than the
        // card: on a two-column grid there is no spare width, and the real
        // price must never be the thing that gets clipped.
        <Text
          numberOfLines={1}
          style={[
            type.small,
            { color: colors.inkMuted, textDecorationLine: 'line-through', flexShrink: 1 },
          ]}
        >
          ₹{Number(cutted).toLocaleString('en-IN')}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Badge / Chip                                                        */
/* ------------------------------------------------------------------ */

export function Badge({ label, tone = 'neutral', icon }) {
  const tones = {
    neutral: { bg: colors.surfaceAlt, fg: colors.inkSecondary },
    accent: { bg: colors.accentSoft, fg: colors.accentDark },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: '#b45309' },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[tone];

  return (
    <View style={[styles.badgePill, { backgroundColor: tones.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={tones.fg} /> : null}
      <Text style={[type.captionMedium, { color: tones.fg }]}>{label}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, onRemove }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[
          type.smallMedium,
          { color: selected ? colors.accentDark : colors.inkSecondary },
        ]}
      >
        {label}
      </Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${label} filter`}>
          <Ionicons name="close" size={14} color={selected ? colors.accentDark : colors.inkMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Quantity stepper                                                    */
/* ------------------------------------------------------------------ */

export function QuantityStepper({ value, onChange, min = 1, max = 99, disabled }) {
  const step = (delta) => {
    const next = Math.max(min, Math.min(value + delta, max));
    if (next !== value) onChange(next);
  };

  const btn = (name, delta, label, isDisabled) => (
    <Pressable
      onPress={() => step(delta)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.stepperBtn,
        pressed && !isDisabled && { backgroundColor: colors.surfaceAlt },
        isDisabled && { opacity: 0.35 },
      ]}
    >
      <Ionicons name={name} size={18} color={colors.ink} />
    </Pressable>
  );

  return (
    <View style={styles.stepper}>
      {btn('remove', -1, 'Decrease quantity', disabled || value <= min)}
      <Text style={[type.bodyMedium, styles.stepperValue]}>{value}</Text>
      {btn('add', 1, 'Increase quantity', disabled || value >= max)}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Skeleton — shimmer beats a spinner for anything over ~300ms          */
/* ------------------------------------------------------------------ */

export function Skeleton({ width = '100%', height = 16, borderRadius = radius.sm, style }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.surfaceAlt, opacity: pulse }, style]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Empty / error states — always offer a way forward                   */
/* ------------------------------------------------------------------ */

export function EmptyState({ icon = 'cube-outline', title, message, actionLabel, onAction }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={36} color={colors.inkMuted} />
      </View>
      <Text style={[type.h3, { color: colors.ink, textAlign: 'center' }]}>{title}</Text>
      {message ? (
        <Text style={[type.small, { color: colors.inkSecondary, textAlign: 'center', marginTop: spacing.xs }]}>
          {message}
        </Text>
      ) : null}
      {actionLabel ? (
        <Button title={actionLabel} onPress={onAction} fullWidth={false} style={{ marginTop: spacing.lg }} />
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Something went wrong"
      message={message}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}

export function Divider({ style }) {
  return <View style={[{ height: 1, backgroundColor: colors.border }, style]} />;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.h2, { color: colors.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {/* The web pairs every section title with a line of context; without
            it a screen of rails is just eight anonymous shelves. */}
        {subtitle ? (
          <Text style={[type.small, { color: colors.inkSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}, ${title}`}
          style={({ pressed }) => [styles.sectionAction, pressed && { opacity: 0.6 }]}
        >
          <Text style={[type.smallMedium, { color: colors.accent }]}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconButton: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...type.caption, fontSize: 10, color: colors.white, fontWeight: '700' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET + 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  input: { flex: 1, color: colors.ink, paddingVertical: 0 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { minWidth: 32, textAlign: 'center', color: colors.ink },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});

export { shadow, colors, spacing, radius, type };
