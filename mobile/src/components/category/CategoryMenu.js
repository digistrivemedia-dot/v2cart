import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  AccessibilityInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, shadow, duration, TOUCH_TARGET } from '../../theme';

/**
 * Category navigation — a horizontally scrolling strip of categories, each of
 * which opens a dropdown panel of its subcategories underneath.
 *
 * The strip scrolls sideways rather than wrapping so the row height stays
 * fixed however many categories exist, and the panel opens in place instead
 * of pushing the user to another screen to find out what's inside a category.
 * Only one panel is open at a time: two open panels and the page stops
 * reading as a single control.
 *
 * Products carry a `category` and a `subcategory` reference, so the strip
 * filters by `category` and every panel row by `subcategory` — there is
 * nothing deeper to filter on, however deep the tree goes.
 */

// Without this the panel appears instantly. Android needs the flag set
// explicitly; iOS has it already.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** A deeper tree flattens into one panel — a dropdown inside a dropdown is a maze. */
function flatten(nodes, out = []) {
  for (const node of nodes) {
    out.push(node);
    if (node.children?.length) flatten(node.children, out);
  }
  return out;
}

function Pill({ category, active, expandable, onPress, onLayout }) {
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityState={{ selected: active, expanded: expandable ? active : undefined }}
      accessibilityLabel={
        expandable ? `${category.name}, ${active ? 'hide' : 'show'} subcategories` : `Browse ${category.name}`
      }
      // Opacity rather than a transform: a scaling pill would nudge its
      // neighbours inside a scroll row.
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text
        style={[type.smallMedium, { color: active ? colors.white : colors.ink }]}
        numberOfLines={1}
      >
        {category.name}
      </Text>
      {expandable ? (
        <Ionicons
          name={active ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={active ? colors.gold : colors.inkSecondary}
        />
      ) : null}
    </Pressable>
  );
}

export default function CategoryMenu({ categories }) {
  const router = useRouter();
  const scroller = useRef(null);
  const offsets = useRef({});
  const reduceMotion = useRef(false);

  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    // Honour the system setting rather than animating regardless.
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      reduceMotion.current = on;
    });
  }, []);

  if (!categories?.length) return null;

  const open = categories.find((c) => c._id === openId) || null;
  const subcategories = open ? flatten(open.children || []) : [];

  const animate = () => {
    if (reduceMotion.current) return;
    LayoutAnimation.configureNext({
      duration: duration.normal,
      create: { type: 'easeOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      // Leaving is quicker than arriving, so dismissing feels immediate.
      delete: { type: 'easeIn', property: 'opacity', duration: Math.round(duration.normal * 0.7) },
    });
  };

  const browse = (category, isTopLevel) => {
    router.push({
      pathname: '/search',
      params: {
        [isTopLevel ? 'category' : 'subcategory']: category.slug,
        categoryLabel: category.name,
      },
    });
  };

  const onPillPress = (category) => {
    // Nothing to drop down — go straight to the products.
    if (!category.children?.length) {
      browse(category, true);
      return;
    }

    animate();
    const next = openId === category._id ? null : category._id;
    setOpenId(next);

    // Keep the pill that owns the open panel on screen, so the panel is
    // visibly attached to something.
    if (next && offsets.current[next] != null) {
      scroller.current?.scrollTo({ x: Math.max(offsets.current[next] - spacing.lg, 0), animated: true });
    }
  };

  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        // The row is the gesture owner; the page still scrolls vertically.
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.push({ pathname: '/search', params: { categoryLabel: 'All Products' } })}
          accessibilityRole="button"
          accessibilityLabel="Browse all products"
          style={({ pressed }) => [styles.pill, styles.pillAll, pressed && { opacity: 0.75 }]}
        >
          <Ionicons name="apps" size={14} color={colors.navy} />
          <Text style={[type.smallMedium, { color: colors.navy }]}>All</Text>
        </Pressable>

        {categories.map((category) => (
          <Pill
            key={category._id}
            category={category}
            active={openId === category._id}
            expandable={Boolean(category.children?.length)}
            onPress={() => onPillPress(category)}
            onLayout={(e) => {
              offsets.current[category._id] = e.nativeEvent.layout.x;
            }}
          />
        ))}
      </ScrollView>

      {open ? (
        <View style={styles.panel}>
          {/* The parent category is the first thing in its own panel —
              "show me everything in here" is the most likely intent. */}
          <Pressable
            onPress={() => browse(open, true)}
            accessibilityRole="button"
            accessibilityLabel={`Browse everything in ${open.name}`}
            style={({ pressed }) => [styles.panelHeader, pressed && { opacity: 0.75 }]}
          >
            <Text style={[type.smallMedium, { color: colors.white, flex: 1 }]} numberOfLines={1}>
              All of {open.name}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.gold} />
          </Pressable>

          <View style={styles.panelBody}>
            {subcategories.map((child) => (
              <Pressable
                key={child._id}
                onPress={() => browse(child, false)}
                accessibilityRole="button"
                accessibilityLabel={`Browse ${child.name}`}
                style={({ pressed }) => [styles.panelRow, pressed && styles.panelRowPressed]}
              >
                <Text style={[type.small, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
                  {child.name}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.inkSecondary} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillAll: {
    borderColor: colors.gold,
    backgroundColor: colors.surface,
  },
  pillActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  panel: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.md,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.navy,
  },
  panelBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    // Two per row on a phone, so a long list doesn't become a long scroll.
    width: '50%',
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  panelRowPressed: { backgroundColor: colors.accentSoft },
});
