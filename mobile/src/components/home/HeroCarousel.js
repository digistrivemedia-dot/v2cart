import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  useWindowDimensions,
  StyleSheet,
  AccessibilityInfo,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, type, TOUCH_TARGET } from '../../theme';

/**
 * The hero — the web's full-bleed slider, sized for a phone.
 *
 * The slide images carry a title, subtitle and call to action, and the web
 * renders all three over the image. The app used to show the bare image, so
 * the whole message of each slide was lost and the top of the home screen
 * read as decoration.
 *
 * Edge-to-edge rather than an inset card: a hero that doesn't touch the sides
 * reads as a banner ad, not as the top of the page.
 */

const AUTOPLAY_MS = 5000;
/** Exported so the loading skeleton can reserve exactly this much space. */
export const HERO_RATIO = 0.52; // of screen height — tall enough to carry a headline

/**
 * Shown when no slider has been published yet — the same two slides, copy and
 * images the web falls back to. Without this the app opens on a category
 * strip while the website opens on a hero, which is most of why the two
 * looked like different products.
 */
const FALLBACK_SLIDES = [
  {
    _id: 'fallback-1',
    title: 'Infinite Potential. Zero Risk.',
    subtitle: 'Buy, sell, and invest — all in one marketplace built for vendors, investors, and customers.',
    ctaText: 'Explore Collection',
    ctaLink: '/search',
    image: { url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1200' },
  },
  {
    _id: 'fallback-2',
    title: 'Your Trusted Marketplace',
    subtitle: 'Wide range. Competitive pricing. Trusted vendors. Everything you need, in one place.',
    ctaText: 'Explore Collection',
    ctaLink: '/search',
    image: { url: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?q=80&w=1200' },
  },
];

/**
 * The scrim.
 *
 * Three stacked bands instead of a real gradient, because a true gradient
 * means pulling in expo-linear-gradient for one decorative fill. Bottom-
 * weighted, so the text sits on the darkest part and the top of the image
 * stays visible.
 */
function Scrim() {
  return (
    <>
      <View style={[styles.scrim, { top: 0, height: '45%', opacity: 0.12 }]} />
      <View style={[styles.scrim, { top: '45%', height: '25%', opacity: 0.4 }]} />
      <View style={[styles.scrim, { top: '70%', height: '30%', opacity: 0.68 }]} />
    </>
  );
}

function Slide({ slide, width, height, onCta }) {
  const source = slide.image?.url || slide.url || slide.video?.thumbnail;

  return (
    <View style={{ width, height }}>
      <Image
        source={source}
        contentFit="cover"
        transition={300}
        cachePolicy="memory-disk"
        style={StyleSheet.absoluteFill}
        accessibilityLabel={slide.title || 'Promotion'}
      />
      <Scrim />

      <View style={styles.slideBody}>
        {/* `display`, not `h1`: at half the screen tall, a 24px headline
            reads as a caption on the image rather than the page's opening
            statement. Capped at two lines so the CTA never gets pushed off. */}
        {slide.title ? (
          <Text style={[type.display, styles.title]} numberOfLines={2}>
            {slide.title}
          </Text>
        ) : null}
        {slide.subtitle ? (
          <Text style={[type.small, styles.subtitle]} numberOfLines={2}>
            {slide.subtitle}
          </Text>
        ) : null}

        {slide.ctaText ? (
          <Pressable
            onPress={() => onCta(slide)}
            accessibilityRole="button"
            accessibilityLabel={slide.ctaText}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          >
            <Text style={[type.smallMedium, { color: colors.navy }]}>{slide.ctaText}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.navy} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const MemoSlide = React.memo(Slide);

export default function HeroCarousel({ slides: published }) {
  const router = useRouter();
  const { width, height: screenH } = useWindowDimensions();
  const list = useRef(null);
  const reduceMotion = useRef(false);

  const slides = published?.length ? published : FALLBACK_SLIDES;

  const [index, setIndex] = useState(0);
  // Autoplay is a convenience, not a ride — once someone swipes, it's theirs.
  const [autoplay, setAutoplay] = useState(true);

  const height = Math.round(screenH * HERO_RATIO);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      reduceMotion.current = on;
      if (on) setAutoplay(false);
    });
  }, []);

  useEffect(() => {
    if (!autoplay || slides.length < 2) return;
    const timer = setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % slides.length;
        list.current?.scrollToOffset({ offset: next * width, animated: true });
        return next;
      });
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [autoplay, slides.length, width]);

  const onMomentumEnd = useCallback(
    (e) => {
      setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
      setAutoplay(false);
    },
    [width]
  );

  const onCta = useCallback(
    (slide) => {
      // Slide links are authored for the website ("/search?category=tiles").
      // Carry the query across and land on the app's search screen; a link to
      // a page the app doesn't have still ends somewhere useful rather than
      // throwing at the navigator.
      const [, query = ''] = String(slide.ctaLink || '').split('?');
      const params = {};
      for (const pair of query.split('&')) {
        const [key, value] = pair.split('=');
        if (key && value) params[key] = decodeURIComponent(value);
      }
      router.push({ pathname: '/search', params });
    },
    [router]
  );

  const goTo = useCallback(
    (i) => {
      setIndex(i);
      setAutoplay(false);
      list.current?.scrollToOffset({ offset: i * width, animated: !reduceMotion.current });
    },
    [width]
  );

  const renderItem = useCallback(
    ({ item }) => <MemoSlide slide={item} width={width} height={height} onCta={onCta} />,
    [width, height, onCta]
  );

  return (
    <View style={{ height }}>
      <FlatList
        ref={list}
        data={slides}
        keyExtractor={(s) => String(s._id || s.title)}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        // Every slide is exactly one screen wide, so the list can skip
        // measuring and jump straight to any index.
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={1}
        windowSize={2}
      />

      {slides.length > 1 ? (
        <View style={styles.dots} pointerEvents="box-none">
          {slides.map((slide, i) => (
            <Pressable
              key={String(slide._id || i)}
              onPress={() => goTo(i)}
              // The dot is 8px of ink inside a 44px target.
              hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityState={{ selected: i === index }}
              accessibilityLabel={`Slide ${i + 1} of ${slides.length}`}
            >
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.navyDark,
  },
  slideBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.white,
    // The scrim carries most of the contrast; the shadow covers the case of a
    // slide image that happens to be pale right where the headline sits.
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 8,
  },
  subtitle: {
    color: colors.surfaceAlt,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 6,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  dots: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.gold,
  },
});
