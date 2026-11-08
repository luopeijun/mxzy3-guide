import { parseInline, plainText } from '../lib/markup';
import { useHighlightPref } from '../hooks/useHighlightPref';

/** Text with the inline markers rendered as highlights. One look for every
 *  category — soft tint, bold, deep tone — the same treatment the notice summary
 *  card uses, so a highlighted keyword means the same thing everywhere and a
 *  step with several of them still reads as one sentence.
 *
 *  The header switch can turn tints off for body copy: the markers are stripped
 *  rather than shown, so the sentence still reads normally. `persistent` opts a
 *  spot out of that switch (the 速览 card, where the tint carries the structure). */

interface Props {
  text: string;
  className?: string;
  tone?: 'brand' | 'note';
  persistent?: boolean;
}

const TONE_CLASS = {
  brand: 'bg-brand-soft text-brand-strong',
  note: 'bg-hl-note-soft text-hl-note',
};

export default function HighlightText({ text, className, tone = 'brand', persistent }: Props) {
  const { enabled } = useHighlightPref();
  const segments = parseInline(text);
  if (!enabled && !persistent) {
    return <span className={className}>{plainText(text)}</span>;
  }
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
