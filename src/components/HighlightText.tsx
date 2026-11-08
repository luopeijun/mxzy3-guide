import { HIGHLIGHT_RE } from '../lib/markup';

/** Text with `**keyword**` markers rendered as a soft highlight. Keeps the
 *  emphasis in the data layer so the important limits (男艺人 / 团体 / 3 张以上)
 *  are decided while writing, not guessed by a keyword list in the UI. */

interface Props {
  text: string;
  className?: string;
}

export default function HighlightText({ text, className }: Props) {
  // split() keeps the captured groups, so odd indices are the highlighted runs.
  const parts = text.split(HIGHLIGHT_RE);
  if (parts.length === 1) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className="rounded-[3px] bg-brand-soft px-[3px] font-semibold text-brand-strong"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </span>
  );
}
