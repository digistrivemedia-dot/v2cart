import React, { useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, type, TOUCH_TARGET } from '../../theme';
import { Button, Chip, Input, Divider } from '../ui';
import { SORT_OPTIONS, EMPTY_FILTERS, countActiveFilters } from '../../utils/filtering';

/**
 * The filter sheet, carrying the same filters the web search sidebar has:
 * the category tree, price range, colour, size, finish and tags — plus sort,
 * which the web has nowhere.
 *
 * Options are derived from the products actually returned, so the sheet can
 * never offer a filter that matches nothing. The one exception is the
 * category tree, which comes from the categories API: the list of what the
 * store sells shouldn't shrink because of the current search. The web
 * sidebar draws the same distinction.
 *
 * Edits are held in local draft state and only applied on "Show results", so
 * a half-built filter never refetches on every tap.
 */

// Defined in utils/filtering.js alongside the logic that consumes them, and
// re-exported here so screens have one import. Keeping a second copy next to
// the UI is how the sheet and the filter ever disagree.
export {
  SORT_OPTIONS,
  EMPTY_FILTERS,
  PREDEFINED_TAGS,
  countActiveFilters,
  buildFacets,
  buildCategoryOptions,
} from '../../utils/filtering';

function Section({ title, children, count, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${count ? `, ${count} selected` : ''}`}
        style={({ pressed }) => [styles.sectionHead, pressed && { opacity: 0.6 }]}
      >
        <Text style={[type.bodyMedium, { color: colors.ink }]}>{title}</Text>
        {count ? (
          <View style={styles.countPill}>
            <Text style={[type.caption, { color: colors.white }]}>{count}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.inkSecondary}
        />
      </Pressable>

      {open ? <View style={{ paddingBottom: spacing.lg }}>{children}</View> : null}
    </View>
  );
}

function ChipGroup({ options, selected, onToggle, labelOf = (o) => o.value }) {
  if (!options?.length) {
    return (
      <Text style={[type.small, { color: colors.inkMuted }]}>
        Nothing to filter on in these results.
      </Text>
    );
  }

  return (
    <View style={styles.chipWrap}>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={`${labelOf(o)}${o.count ? ` (${o.count})` : ''}`}
          selected={selected.includes(o.value)}
          onPress={() => onToggle(o.value)}
        />
      ))}
    </View>
  );
}

/**
 * One row of the category tree: a checkbox to filter by it, and — if it has
 * children — a chevron to reveal them. Two separate targets, because
 * "include this" and "show me what's under this" are different intents.
 */
function CategoryRow({ node, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const checked = (selected[node.group] || []).includes(node.value);
  const hasChildren = node.children?.length > 0;

  return (
    <View>
      <View style={[styles.treeRow, { paddingLeft: node.depth * spacing.lg }]}>
        <Pressable
          onPress={() => onToggle(node.group, node.value)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`${node.label}, ${node.count} products`}
          style={({ pressed }) => [styles.treeLabel, pressed && { opacity: 0.6 }]}
        >
          <View style={[styles.checkbox, checked && styles.checkboxOn]}>
            {checked ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
          </View>
          <Text
            style={[
              node.depth === 0 ? type.smallMedium : type.small,
              { color: node.count === 0 ? colors.inkMuted : colors.ink, flex: 1 },
            ]}
            numberOfLines={1}
          >
            {node.label}
          </Text>
          <Text style={[type.caption, { color: colors.inkMuted }]}>({node.count})</Text>
        </Pressable>

        {hasChildren ? (
          <Pressable
            onPress={() => setOpen((v) => !v)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`${open ? 'Hide' : 'Show'} ${node.label} subcategories`}
            style={({ pressed }) => [styles.treeChevron, pressed && { opacity: 0.6 }]}
          >
            <Ionicons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.inkSecondary}
            />
          </Pressable>
        ) : null}
      </View>

      {hasChildren && open
        ? node.children.map((child) => (
            <CategoryRow key={child.id} node={child} selected={selected} onToggle={onToggle} />
          ))
        : null}
    </View>
  );
}

export default function FilterSheet({ visible, onClose, facets, categoryOptions, value, onApply }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(value);

  // Re-seed the draft each time the sheet opens, so a cancelled edit is
  // genuinely discarded.
  React.useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const activeCount = useMemo(() => countActiveFilters(draft), [draft]);

  const toggleIn = (key, v) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(v) ? d[key].filter((x) => x !== v) : [...d[key], v],
    }));

  const toggle = (key) => (v) => toggleIn(key, v);

  const categoryCount = draft.categories.length + draft.subcategories.length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Tapping the scrim dismisses — the expected escape on mobile. */}
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close filters" />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <Text style={[type.h2, { color: colors.ink, flex: 1 }]}>Filters</Text>
            <Pressable
              onPress={() => setDraft({ ...EMPTY_FILTERS })}
              hitSlop={10}
              accessibilityRole="button"
              disabled={activeCount === 0}
            >
              <Text
                style={[
                  type.smallMedium,
                  { color: activeCount === 0 ? colors.inkMuted : colors.accent },
                ]}
              >
                Clear all
              </Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close filters">
              <Ionicons name="close" size={24} color={colors.inkSecondary} />
            </Pressable>
          </View>

          <Divider />

          <ScrollView
            style={{ maxHeight: 460 }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            {/* Sort is open by default — it's the control people reach for
                most, and the web buries it nowhere because it has none. */}
            <Section title="Sort by" defaultOpen count={draft.sort !== 'relevance' ? 1 : 0}>
              <View style={styles.chipWrap}>
                {SORT_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    selected={draft.sort === o.value}
                    onPress={() => setDraft((d) => ({ ...d, sort: o.value }))}
                  />
                ))}
              </View>
            </Section>

            <Section
              title="Price"
              count={(draft.minPrice ? 1 : 0) + (draft.maxPrice ? 1 : 0)}
            >
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Min ₹"
                    value={draft.minPrice}
                    onChangeText={(t) =>
                      setDraft((d) => ({ ...d, minPrice: t.replace(/[^0-9]/g, '') }))
                    }
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Max ₹"
                    value={draft.maxPrice}
                    onChangeText={(t) =>
                      setDraft((d) => ({ ...d, maxPrice: t.replace(/[^0-9]/g, '') }))
                    }
                    keyboardType="number-pad"
                    placeholder="Any"
                  />
                </View>
              </View>
            </Section>

            <Section title="Category" count={categoryCount}>
              {categoryOptions?.length ? (
                categoryOptions.map((node) => (
                  <CategoryRow key={node.id} node={node} selected={draft} onToggle={toggleIn} />
                ))
              ) : (
                <ChipGroup
                  options={facets.categories}
                  selected={draft.categories}
                  onToggle={toggle('categories')}
                  labelOf={(o) => o.label}
                />
              )}
            </Section>

            <Section title="Colour" count={draft.colors.length}>
              <ChipGroup options={facets.colors} selected={draft.colors} onToggle={toggle('colors')} />
            </Section>

            <Section title="Size" count={draft.sizes.length}>
              <ChipGroup options={facets.sizes} selected={draft.sizes} onToggle={toggle('sizes')} />
            </Section>

            <Section title="Finish" count={draft.finishes.length}>
              <ChipGroup
                options={facets.finishes}
                selected={draft.finishes}
                onToggle={toggle('finishes')}
              />
            </Section>

            <Section title="Tags" count={draft.tags.length}>
              <ChipGroup
                options={facets.tags}
                selected={draft.tags}
                onToggle={toggle('tags')}
                labelOf={(o) => o.value.charAt(0).toUpperCase() + o.value.slice(1)}
              />
            </Section>
          </ScrollView>

          <Divider />

          <View style={{ padding: spacing.lg }}>
            <Button
              title={activeCount > 0 ? `Show results (${activeCount} filters)` : 'Show results'}
              onPress={() => {
                onApply(draft);
                onClose();
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  section: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET + 4,
  },
  countPill: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  treeRow: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH_TARGET },
  treeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    minHeight: TOUCH_TARGET,
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
  treeChevron: {
    width: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
