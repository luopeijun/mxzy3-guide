/** Inline emphasis markers shared by the data layer and the UI.
 *  `**关键词**` is decoded by HighlightText and stripped everywhere text is
 *  measured or searched, so the markers never leak into copy or counts. */

export const HIGHLIGHT_RE = /\*\*(.+?)\*\*/g;

export function plainText(text: string): string {
  return text.replace(HIGHLIGHT_RE, '$1');
}
