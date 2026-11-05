import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, TOUCH_TARGET } from '../../src/theme';
import { productApi, categoryApi } from '../../src/api/endpoints';
import { useAsync, useDebounced } from '../../src/hooks/useAsync';
import ProductCard, { CARD_BODY_HEIGHT } from '../../src/components/product/ProductCard';
import { Skeleton, EmptyState, ErrorState, Chip } from '../../src/components/ui';
import FilterSheet, {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  buildFacets,
  buildCategoryOptions,
  countActiveFilters,
} from '../../src/components/search/FilterSheet';
import { applyFilters, applySort, activeChips, removeChip } from '../../src/utils/filtering';

const { width: SCREEN_W } = Dimensions.get('window');
const GUTTER = spacing.lg;
const COLS = 2;
const CARD_W = (SCREEN_W - GUTTER * 2 - spacing.md) / COLS;

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Debounced so typing doesn't fire a request per keystroke.
  const debouncedQuery = useDebounced(query, 400);

  /**
   * Arriving from a category row on home. These go to the backend rather than
   * the client-side filters: a subcategory can't be matched locally, because
   * the product list only carries its parent category's slug.
   *
   * `browsing` is state, not a derived value, so the chip can be dismissed
   * without navigating away.
   */
  const [browsing, setBrowsing] = useState(null);

  useEffect(() => {
    if (params.category) {
      setBrowsing({ key: 'category', slug: String(params.category), label: params.categoryLabel });
    } else if (params.subcategory) {
      setBrowsing({
        key: 'subcategory',
        slug: String(params.subcategory),
        label: params.categoryLabel,
      });
    } else {
      setBrowsing(null);
    }
  }, [params.category, params.subcategory, params.categoryLabel]);

  // A tag has no server-side equivalent, so it lands as a client filter —
  // which also means it shows up as a removable chip like any other.
  useEffect(() => {
    if (params.tag) {
      setFilters((f) => ({ ...f, tags: [String(params.tag).toLowerCase()] }));
    }
  }, [params.tag]);

  const { data, loading, error, refetch } = useAsync(
    () =>
      productApi.list({
        keyword: debouncedQuery || undefined,
        ...(browsing ? { [browsing.key]: browsing.slug } : null),
        limit: 100,
      }),
    [debouncedQuery, browsing?.key, browsing?.slug]
  );

  // The store's whole category tree, not just what the results happen to
  // contain — the filter list shouldn't shrink because of the current search.
  const categories = useAsync(() => categoryApi.list(), []);

  const products = data?.products ?? [];
  const facets = useMemo(() => buildFacets(products), [products]);
  const categoryOptions = useMemo(
    () => buildCategoryOptions(categories.data?.categories ?? [], products),
    [categories.data, products]
  );
  const results = useMemo(
    () => applySort(applyFilters(products, filters), filters.sort),
    [products, filters]
  );
  const chips = useMemo(() => activeChips(filters, facets), [filters, facets]);
  const activeCount = countActiveFilters(filters);
  const sortLabel = SORT_OPTIONS.find((o) => o.value === filters.sort)?.label ?? 'Relevance';

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search tiles, colours, sizes"
            placeholderTextColor={colors.inkMuted}
            style={[type.body, styles.searchInput]}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search products"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Filters${activeCount ? `, ${activeCount} active` : ''}`}
          style={({ pressed }) => [styles.filterBtn, activeCount > 0 && styles.filterBtnOn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={activeCount > 0 ? colors.white : colors.ink}
          />
          {activeCount > 0 ? (
            <View style={styles.filterCount}>
              <Text style={styles.filterCountText}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* What category this list is scoped to, and a way out of it. */}
      {browsing ? (
        <View style={styles.browsingRow}>
          <Ionicons name="pricetag-outline" size={14} color={colors.accentDark} />
          <Text style={[type.smallMedium, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
            {browsing.label || browsing.slug}
          </Text>
          <Pressable
            onPress={() => setBrowsing(null)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Show all categories"
          >
            <Ionicons name="close-circle" size={18} color={colors.inkSecondary} />
          </Pressable>
        </View>
      ) : null}

      {/* Active filters stay visible — never hidden behind a closed sheet. */}
      {chips.length > 0 ? (
        <FlatList
          data={chips}
          keyExtractor={(c) => c.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              selected
              onRemove={() => setFilters((f) => removeChip(f, item))}
            />
          )}
        />
      ) : null}

      {/* Count and sort sit together above the grid: how many results, and
          on what order — the two questions a result list has to answer. */}
      {!loading || data ? (
        <View style={styles.toolbar}>
          <Text style={[type.small, { color: colors.inkSecondary, flex: 1 }]}>
            {results.length} product{results.length === 1 ? '' : 's'}
            {query ? ` for “${query}”` : ''}
          </Text>
          <Pressable
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${sortLabel}, change`}
            style={({ pressed }) => [styles.sortBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="swap-vertical" size={14} color={colors.accent} />
            <Text style={[type.captionMedium, { color: colors.accent }]}>{sortLabel}</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && !data ? (
        <View style={[styles.grid, styles.skelGrid]}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width={CARD_W} height={CARD_W + CARD_BODY_HEIGHT} borderRadius={radius.lg} />
          ))}
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : results.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="No products found"
          message={
            activeCount > 0
              ? 'Try removing a filter or widening the price range.'
              : browsing
                ? 'Nothing in this category yet.'
                : 'Try a different search term.'
          }
          actionLabel={activeCount > 0 ? 'Clear filters' : undefined}
          onAction={() => setFilters(EMPTY_FILTERS)}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(p) => String(p._id)}
          numColumns={COLS}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={[styles.grid, { paddingBottom: spacing.lg + insets.bottom }]}
          renderItem={({ item }) => <ProductCard product={item} width={CARD_W} />}
          // Long result sets are windowed; a 100-item grid of images will
          // otherwise chew memory on mid-range Android.
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
        />
      )}

      <FilterSheet
        categoryOptions={categoryOptions}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        facets={facets}
        value={filters}
        onApply={setFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.navy,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.ink, paddingVertical: 0 },
  filterBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Filled when filters are on, so "these results are narrowed" is readable
  // at a glance and not only from the badge count.
  filterBtnOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  filterCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.navy,
  },
  filterCountText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  browsingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  chipRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  grid: { padding: GUTTER, gap: spacing.md },
  skelGrid: { flexDirection: 'row', flexWrap: 'wrap' },
});
