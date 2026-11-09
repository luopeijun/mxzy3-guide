import type { ReactNode } from 'react';

/** Wrap every case-insensitive occurrence of `query` in a soft gold <mark>,
 *  so a search result explains itself without changing the guide's typography. */
export default function MarkText({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;

  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let at = haystack.indexOf(target, cursor);
  while (at >= 0) {
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <mark key={at} className="rounded-ui-xs bg-gold-soft px-[2px] text-ink">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    cursor = at + needle.length;
    at = haystack.indexOf(target, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
