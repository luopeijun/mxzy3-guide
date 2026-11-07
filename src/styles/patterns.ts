/** Shared Tailwind recipes.
 *  Keeps repeated visual patterns (cards, layout, meta text) in one place so
 *  every component speaks the same design language. Component-specific
 *  utilities stay next to the markup that uses them. */

export const ui = {
  /* Layout */
  content:
    'mx-auto max-w-[880px] px-9 pt-7 pb-[88px] nav:px-[18px] nav:pt-[22px] nav:pb-16',
  sectionTitle: 'mb-[14px] mt-8 text-ui-lg font-bold',

  /* Cards — reused by Overview and ChildLinks */
  cardGrid: 'grid grid-cols-2 gap-[14px] nav:grid-cols-1',
  card:
    'rounded-ui-md border border-line bg-surface px-5 py-[18px] text-left shadow-soft transition duration-150 hover:-translate-y-0.5 hover:border-brand-line hover:shadow-card',
  cardHead: 'flex items-center justify-between gap-2',
  cardTitle: 'text-ui-lg font-bold text-brand-strong',
  cardSource: 'mt-0.5 text-ui-2xs text-ink-faint',
  cardDesc: 'mt-3 text-ui-xs leading-[1.75] text-ink-muted',
  cardFoot: 'mt-[14px] text-ui-2xs text-ink-faint',

  /* Shared text roles */
  meta: 'text-ui-2xs text-ink-faint',
  muted: 'text-ui-xs text-ink-muted',
  softPanel: 'rounded-ui-md border border-line bg-surface-soft',
} as const;
