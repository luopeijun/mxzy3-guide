import { parseInline } from '../lib/markup';

/** Text with the inline markers rendered as highlights. One look for every
 *  category — soft brand tint, bold, deep plum — the same treatment the notice
 *  summary card uses, so a highlighted keyword means the same thing everywhere
 *  and a step with several of them still reads as one sentence. */

interface Props {
  text: string;
  className?: string;
}

export default function HighlightText({ text, className }: Props) {
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
            className="rounded-[3px] bg-brand-soft px-[3px] font-semibold text-brand-strong"
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
