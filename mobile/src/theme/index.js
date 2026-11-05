/**
 * Design tokens, lifted from the web storefront so the app and the site read
 * as one product.
 *
 * Sources: tilesecommerse/tailwind.config.js (brand.navy, brand.gold) and
 * src/styles/colors.css, cross-checked against what the storefront actually
 * renders — orange-500 for prices and primary CTAs, the slate scale for ink.
 *
 * Always consume these by role (`colors.accent`), never by hex. The palette
 * then moves in one place, which is the only reason a token file earns its
 * keep.
 *
 * Light mode only for v1, deliberately: the web storefront is light-only, and
 * a dark theme has to be designed and contrast-checked rather than inverted.
 */

export const colors = {
  // Brand — the dark header and its gold tagline
  navy: '#0f1b3c',
  navyDark: '#0a1329',
  gold: '#d4af37',

  // Accent — prices, primary CTAs. orange-500/600/50 on the web.
  accent: '#f97316',
  accentDark: '#ea580c',
  accentSoft: '#fff7ed',

  // Ink — the slate scale
  ink: '#0f172a',
  inkSecondary: '#475569',
  inkMuted: '#94a3b8',

  // Surfaces
  surface: '#ffffff',
  canvas: '#f8fafc',
  surfaceAlt: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',

  // Status. Each is always paired with an icon or text — never colour alone.
  success: '#16a34a',
  successSoft: '#dcfce7',
  warning: '#f59e0b',
  warningSoft: '#fffbeb',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',

  // Fixed
  white: '#ffffff',
  black: '#000000',
  overlay: 'rgba(15, 23, 42, 0.5)',
};

/** 4/8 rhythm. Nothing should use a raw pixel gap. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

/**
 * Rubik for headings, Nunito Sans for body — the e-commerce pairing the design
 * system returns. Body sits at 16 so iOS never auto-zooms a form.
 */
export const fonts = {
  heading: 'Rubik_600SemiBold',
  headingBold: 'Rubik_700Bold',
  body: 'NunitoSans_400Regular',
  bodyMedium: 'NunitoSans_600SemiBold',
  bodyBold: 'NunitoSans_700Bold',
};

export const type = {
  display: { fontFamily: fonts.headingBold, fontSize: 32, lineHeight: 40 },
  h1: { fontFamily: fonts.headingBold, fontSize: 24, lineHeight: 32 },
  h2: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 28 },
  h3: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  smallMedium: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  captionMedium: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  /** Prices and any aligned numbers — tabular so columns don't jitter. */
  price: { fontFamily: fonts.headingBold, fontSize: 20, fontVariant: ['tabular-nums'] },
  priceSmall: { fontFamily: fonts.headingBold, fontSize: 16, fontVariant: ['tabular-nums'] },
};

/** One elevation scale. Random shadow values are what make an app look cheap. */
export const shadow = {
  sm: {
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lg: {
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

/** Apple HIG minimum. Anything tappable is at least this tall. */
export const TOUCH_TARGET = 44;

/** Micro-interactions live in the 150–300ms band. */
export const duration = { fast: 150, normal: 220, slow: 300 };

export default { colors, spacing, radius, fonts, type, shadow, duration, TOUCH_TARGET };
