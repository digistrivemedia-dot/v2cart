import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type } from '../../theme';

/**
 * The product's tags, as the web product page shows them.
 *
 * The web uses an emoji per tag (⭐ 🔥 ✨ …). These are vector icons instead:
 * emoji render differently on every OS version and can't be themed, so they
 * make a native app look unfinished.
 */
const TAG_STYLES = {
  popular: { icon: 'star', fg: '#1d4ed8', bg: '#dbeafe' },
  trending: { icon: 'flame', fg: '#a16207', bg: '#fef9c3' },
  new: { icon: 'sparkles', fg: '#15803d', bg: '#dcfce7' },
  premium: { icon: 'diamond', fg: '#7e22ce', bg: '#f3e8ff' },
  exclusive: { icon: 'ribbon', fg: '#be185d', bg: '#fce7f3' },
  classic: { icon: 'bookmark', fg: '#334155', bg: '#f1f5f9' },
  bestseller: { icon: 'trophy', fg: '#c2410c', bg: '#ffedd5' },
  limited: { icon: 'time', fg: '#b91c1c', bg: '#fee2e2' },
};

const FALLBACK = { icon: 'pricetag', fg: colors.inkSecondary, bg: colors.surfaceAlt };

export default function TagBadges({ tags }) {
  if (!tags?.length) return null;

  return (
    <View style={styles.wrap}>
      {tags.map((raw) => {
        const tag = String(raw).toLowerCase();
        const style = TAG_STYLES[tag] || FALLBACK;

        return (
          <View key={tag} style={[styles.badge, { backgroundColor: style.bg }]}>
            <Ionicons name={style.icon} size={11} color={style.fg} />
            <Text style={[type.captionMedium, { color: style.fg }]}>
              {tag.charAt(0).toUpperCase() + tag.slice(1)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
});
