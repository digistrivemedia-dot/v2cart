import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  RefreshControl,
  Pressable,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, TOUCH_TARGET } from '../../src/theme';
import { productApi, categoryApi, sliderApi } from '../../src/api/endpoints';
import { useAsync } from '../../src/hooks/useAsync';
import ProductCard, { CARD_BODY_HEIGHT } from '../../src/components/product/ProductCard';
import CategoryMenu from '../../src/components/category/CategoryMenu';
import HeroCarousel, { HERO_RATIO } from '../../src/components/home/HeroCarousel';
import { SectionHeader, Skeleton, ErrorState, IconButton } from '../../src/components/ui';
import { useCartStore } from '../../src/store/cartStore';

const CARD_W = 168;
/** Per rail. Beyond this, the rail is a wall and "See all" is the answer. */
const RAIL_MAX = 12;

/**
 * Home — the same shelves the web home page has, as horizontal rails.
 *
 * The web renders eight tag-driven sections (Trending, Popular, New, Best
 * Seller, Premium, Exclusive, Classic, Limited). Rather than eight requests,
 * this pulls the catalogue once and partitions it by tag on the client —
 * which is also what makes pull-to-refresh a single round trip.
 */
const RAILS = [
  { tag: 'trending', title: 'Trending Now', subtitle: 'What everyone is buying this week' },
  { tag: 'popular', title: 'Popular Picks', subtitle: 'Customer favourites and best-sellers' },
  { tag: 'new', title: 'New Arrivals', subtitle: 'Fresh in from our vendors' },
  { tag: 'bestseller', title: 'Best Sellers', subtitle: 'Our most ordered products' },
  { tag: 'premium', title: 'Premium Range', subtitle: 'Top-tier quality and finish' },
  { tag: 'exclusive', title: 'Exclusive', subtitle: 'Only available here' },
  { tag: 'classic', title: 'Classics', subtitle: 'Timeless pieces that always work' },
  { tag: 'limited', title: 'Limited Edition', subtitle: 'Small runs, while stock lasts' },
];

function Rail({ title, subtitle, products, params }) {
  const router = useRouter();
  if (!products?.length) return null;

  // Category rails hand the slug to search so it filters server-side; tag
  // rails have nothing to hand over, since tags are matched on the client.
  const seeAll = () => router.push({ pathname: '/search', params: params ?? {} });

  return (
    <View style={{ marginBottom: spacing.xl }}>
      <SectionHeader title={title} subtitle={subtitle} actionLabel="See all" onAction={seeAll} />
      <FlatList
        data={products}
        keyExtractor={(p) => String(p._id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
        renderItem={({ item }) => <ProductCard product={item} width={CARD_W} />}
        // Rails are short; windowing a 10-item list costs more than it saves.
        initialNumToRender={4}
        // Scrolling to the end of a rail is itself an intent to see more, so
        // the exit sits exactly where that scroll lands.
        ListFooterComponent={
          <Pressable
            onPress={seeAll}
            accessibilityRole="button"
            accessibilityLabel={`See all ${title}`}
            style={({ pressed }) => [styles.railEnd, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.railEndIcon}>
              <Ionicons name="arrow-forward" size={20} color={colors.white} />
            </View>
            <Text style={[type.smallMedium, { color: colors.ink, textAlign: 'center' }]}>
              See all
            </Text>
          </Pressable>
        }
      />
    </View>
  );
}

function HomeSkeleton({ heroHeight }) {
  return (
    <View>
      {/* Edge to edge and the hero's real height, so the page doesn't lurch
          when the slides land. */}
      <Skeleton height={heroHeight} borderRadius={0} />
      {/* Same shape and height as the category pills, so nothing jumps when
          the real strip arrives. */}
      <View style={styles.skelRow}>
        {[96, 120, 80, 110].map((w, i) => (
          <Skeleton key={i} width={w} height={TOUCH_TARGET} borderRadius={radius.pill} />
        ))}
      </View>
      {[0, 1].map((s) => (
        <View key={s} style={{ marginTop: spacing.xl }}>
          <Skeleton width={160} height={22} style={{ marginHorizontal: spacing.lg }} />
          <View style={styles.skelRow}>
            {[0, 1].map((i) => (
              <Skeleton key={i} width={CARD_W} height={CARD_W + CARD_BODY_HEIGHT} borderRadius={radius.lg} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cartCount = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const { height: screenH } = useWindowDimensions();

  const products = useAsync(() => productApi.list({ limit: 100 }), []);
  const categories = useAsync(() => categoryApi.list(), []);
  const sliders = useAsync(() => sliderApi.active(), []);

  const byTag = useMemo(() => {
    const list = products.data?.products ?? [];
    const map = {};
    for (const rail of RAILS) {
      map[rail.tag] = list.filter((p) =>
        (p.tags || []).map((t) => String(t).toLowerCase()).includes(rail.tag)
      );
    }
    // Anything untagged still deserves to be seen, so it backs a general rail.
    map.__all = list;
    return map;
  }, [products.data]);

  /**
   * A rail per category, from the products already fetched — no extra
   * requests.
   *
   * These matter more than the tag rails in practice: tags are set by hand
   * and are usually empty, in which case every tag rail disappears and the
   * home screen collapses to a single shelf. Category comes from the product
   * itself, so these rails always have something in them.
   *
   * Busiest category first, so the screen opens on its deepest shelf.
   */
  const byCategory = useMemo(() => {
    const list = products.data?.products ?? [];
    const groups = new Map();

    for (const p of list) {
      const category = p.category;
      if (!category?.name) continue;
      const slug = String(category.slug || category._id);
      if (!groups.has(slug)) {
        groups.set(slug, { slug, name: category.name, products: [] });
      }
      groups.get(slug).products.push(p);
    }

    return [...groups.values()].sort((a, b) => b.products.length - a.products.length);
  }, [products.data]);

  const refreshing = products.loading && Boolean(products.data);

  const onRefresh = useCallback(() => {
    products.refetch();
    categories.refetch();
    sliders.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const railsWithItems = RAILS.filter((r) => byTag[r.tag]?.length);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* Brand header — navy + gold, straight from the web */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={{ flex: 1 }}>
          <Text style={[type.h2, { color: colors.white }]}>InveztIN</Text>
          <Text style={[type.caption, { color: colors.gold }]}>Infinite Potential. Zero Risk.</Text>
        </View>
        <IconButton
          name="search-outline"
          label="Search products"
          color={colors.white}
          onPress={() => router.push('/search')}
        />
        <IconButton
          name="bag-handle-outline"
          label={`Cart, ${cartCount} items`}
          color={colors.white}
          badge={cartCount}
          onPress={() => router.push('/cart')}
        />
      </View>

      {products.loading && !products.data ? (
        <HomeSkeleton heroHeight={Math.round(screenH * HERO_RATIO)} />
      ) : products.error && !products.data ? (
        <ErrorState message={products.error} onRetry={products.refetch} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.xxl + insets.bottom }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          <HeroCarousel slides={sliders.data?.sliders} />

          {categories.data?.categories?.length ? (
            <View style={{ marginTop: spacing.xl }}>
              <SectionHeader title="Shop by category" subtitle="Tap a category to see what's inside" />
              {/* Scrolls sideways; tapping a category drops its
                  subcategories down in place. */}
              <CategoryMenu categories={categories.data.categories} />
            </View>
          ) : null}

          <View style={{ marginTop: spacing.xl }}>
            {railsWithItems.map((rail) => (
              <Rail
                key={rail.tag}
                title={rail.title}
                subtitle={rail.subtitle}
                products={byTag[rail.tag].slice(0, RAIL_MAX)}
                // The tag slug, not the display title — search filters on the
                // slug, and "Trending Now" matches no tag.
                params={{ tag: rail.tag, categoryLabel: rail.title }}
              />
            ))}

            {byCategory.map((group) => (
              <Rail
                key={group.slug}
                title={group.name}
                subtitle={`${group.products.length} product${group.products.length === 1 ? '' : 's'} in ${group.name}`}
                products={group.products.slice(0, RAIL_MAX)}
                params={{ category: group.slug, categoryLabel: group.name }}
              />
            ))}

            {/* No tagged products yet — show the catalogue rather than a
                home screen that looks broken. */}
            {/* Only a fallback now: with category rails above, "everything"
                again would be the same products a third time. */}
            {railsWithItems.length === 0 && byCategory.length === 0 ? (
              <Rail
                title="All Products"
                subtitle="Everything in the catalogue"
                products={byTag.__all.slice(0, 20)}
                params={{}}
              />
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.navy,
  },
  railEnd: {
    width: 108,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  railEndIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skelRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
});
