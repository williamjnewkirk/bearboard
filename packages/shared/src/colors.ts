/**
 * BearBoard brand palette â single source of truth for both apps. Don't
 * hardcode these hex values elsewhere; import from here (mobile imports
 * directly; the web Tailwind config duplicates the values at build time only
 * because tailwind.config.ts can't resolve a workspace TS import â keep the
 * two in sync).
 *
 * Source: brand spec, July 2026.
 *   maroon  #971B2F  rgb(151, 27, 47)
 *   crimson #BA0C2F  rgb(186, 12, 47)
 *   forest  #13322B  rgb(19, 50, 43)
 *   green   #215732  rgb(33, 87, 50)
 */
export const BRAND_COLORS = {
  /** Primary â default buttons, links, brand headers. */
  maroon: '#971B2F',
  /** Emphasis / destructive actions (regenerate code, remove, leave). */
  crimson: '#BA0C2F',
  /** Dark neutral â near-black text/background alternative with brand hue. */
  forest: '#13322B',
  /** Secondary â positive/confirmation states, secondary actions. */
  green: '#215732',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export type BrandColorName = keyof typeof BRAND_COLORS;
