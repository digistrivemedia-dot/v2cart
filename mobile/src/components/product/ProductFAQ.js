import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, duration, TOUCH_TARGET } from '../../theme';

/**
 * The FAQ block from the web product page, same questions and answers.
 *
 * Hardcoded there and hardcoded here: they're store policy, not product data,
 * and there is no endpoint serving them. If they ever move into the CMS this
 * takes a `faqs` prop and the default stays as the fallback.
 */
const FAQS = [
  {
    q: 'How do you ensure the quality of your products?',
    a: "Every product on InveztIN is sourced from vetted vendors and undergoes quality checks before it's listed. We partner with sellers known for reliability and consistent quality — so you get exactly what you ordered.",
  },
  {
    q: 'Do you offer delivery support?',
    a: 'Yes! We provide doorstep delivery to your address. You can track your order status from your account at any time after checkout.',
  },
  {
    q: 'What is your return and exchange policy?',
    a: 'We accept returns or exchanges within 7 days of purchase for unused, unopened products in original packaging. In case of any manufacturing defects, we work directly with the vendor to ensure a swift replacement. Please contact our team with your order details and we’ll sort it out promptly.',
  },
  {
    q: 'Can your team help me choose the right product?',
    a: "Absolutely! Reach out via the WhatsApp or Call buttons on this page or contact our support team, and we'll help you find the right fit for your needs and budget.",
  },
  {
    q: 'How do I get in touch with support?',
    a: 'You can reach us via the WhatsApp or Call buttons on this page. Our team typically responds within one business day.',
  },
];

export default function ProductFAQ() {
  // The web opens the first answer; a closed accordion of five rows reads as
  // a wall of questions nobody asked.
  const [open, setOpen] = useState(0);

  const toggle = (i) => {
    LayoutAnimation.configureNext({
      duration: duration.normal,
      update: { type: 'easeInEaseOut' },
      create: { type: 'easeOut', property: 'opacity' },
      delete: { type: 'easeIn', property: 'opacity' },
    });
    setOpen((current) => (current === i ? null : i));
  };

  return (
    <View style={styles.card}>
      <Text style={[type.h2, { color: colors.white, marginBottom: spacing.md }]}>FAQs</Text>

      {FAQS.map((faq, i) => (
        <View key={faq.q} style={styles.row}>
          <Pressable
            onPress={() => toggle(i)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open === i }}
            style={({ pressed }) => [styles.question, pressed && { opacity: 0.7 }]}
          >
            <Text style={[type.smallMedium, { color: colors.white, flex: 1 }]}>{faq.q}</Text>
            <Ionicons
              name={open === i ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={open === i ? colors.gold : colors.borderStrong}
            />
          </Pressable>

          {open === i ? (
            <Text style={[type.small, styles.answer]}>{faq.a}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.navy,
  },
  row: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  question: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  answer: {
    // Light on navy: contrast stays well clear of 4.5:1 for body text.
    color: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
