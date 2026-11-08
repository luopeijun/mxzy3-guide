import { parseInline } from '../lib/markup';

/** Text with the inline markers rendered as highlights. One look for every
 *  category — soft tint, bold, deep tone — the same treatment the notice summary
 *  card uses, so a highlighted keyword means the same thing everywhere and a
 *  step with several of them still reads as one sentence.
 *
 *  `tone="note"` re-cuts that look in amber for the cream reminder blocks, where
 *  a rose chip would clash with the block's own background. */

interface Props {
  text: string;
  className?: string;
  tone?: 'brand' | 'note';
}

const TONE_CLASS = {
  brand: 'bg-brand-soft text-brand-strong',
  note: 'bg-hl-note-soft text-hl-note',
};

export default function HighlightText({ text, className, tone = 'brand' }: Props) {
  const segments = parseInline(text);
  if (segments.length === 1 && !segments[0].kind) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.kind ? (
          <mark
            key={index}
            className={`rounded-[3px] px-[3px] font-semibold ${TONE_CLASS[tone]}`}
          >
            {segment.text}
          </mark>
        ) : (
          segment.text
        ),
      )}
    </span>
  );
}
