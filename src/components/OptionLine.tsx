import { cn } from '../lib/cn';

/** `A.先接电话——…` / `b.自制唱片5张…` / `C 关古威…` — the marker is the choice label.
 *  The docx mixes a dot and a plain space, so both forms are accepted; the CJK
 *  lookahead keeps text like `M V 演出：` out of the match. */
const MARKER_RE = /^([A-Za-zＡ-Ｚａ-ｚ])(?:[.．、]\s*|[ 　]+(?=[\u4e00-\u9fff]))(.+)$/;

interface Props {
  text: string;
  className?: string;
}

/**
 * One choice inside an event. Lettered choices get a grey row with a badge and
 * an extra indent so a list of options never reads as another sentence of the
 * event text; unlettered follow-ups (`旗下艺人为…`) keep a thin grey rail.
 */
export default function OptionLine({ text, className }: Props) {
  const match = MARKER_RE.exec(text);
  if (!match) {
    return (
      <p
        className={cn(
          'border-l-2 border-choice-line pl-2.5 text-ui-xs leading-[1.85] break-words text-choice',
          className,
        )}
      >
        {text}
      </p>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-ui-xs bg-choice-soft px-2 py-[7px]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-[1px] flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[4px] bg-surface text-ui-2xs font-bold text-choice shadow-[inset_0_0_0_1px_var(--color-choice-line)]"
      >
        {match[1].toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 text-ui-sm leading-[1.8] break-words text-choice">{match[2]}</span>
    </div>
  );
}
