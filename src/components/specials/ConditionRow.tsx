import type { RowEval, EvalPart } from '../../lib/specialsState';
import { cn } from '../../lib/cn';

interface Props {
  item: RowEval;
  onCheck: (key: string) => void;
  onBump: (key: string, delta: number) => void;
  onValue: (key: string, value: number) => void;
}

const CHECK_TEXT: Record<string, string> = {
  item: '已拿到',
  flag: '已完成',
  cert: '已取得',
};

function checkText(type: string, met: boolean): string {
  const label = CHECK_TEXT[type] ?? '已确认';
  return met ? `✓ ${label}` : `○ 待确认`;
}

function PartControl({
  part, rowType, showLabel, onCheck, onBump, onValue,
}: {
  part: EvalPart;
  rowType: string;
  showLabel: boolean;
  onCheck: (key: string) => void;
  onBump: (key: string, delta: number) => void;
  onValue: (key: string, value: number) => void;
}) {
  const label = showLabel ? (
    <span className="mr-1 text-ui-2xs text-ink-faint">{part.label}</span>
  ) : null;

  if (part.input === 'none') {
    return (
      <span
        data-part-readonly
        data-part-key={part.key}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-ui-2xs',
          part.met ? 'bg-growth-soft text-growth-strong' : 'bg-surface-soft text-ink-faint ring-1 ring-line',
        )}
      >
        {label}
        <span>{part.detail}</span>
      </span>
    );
  }

  if (part.input === 'check') {
    return (
      <span className="inline-flex items-center gap-1">
        {label}
        <button
          type="button"
          data-part-check
          data-part-key={part.key}
          onClick={() => onCheck(part.key)}
          className={cn(
            'rounded-full px-2 py-0.5 text-ui-2xs transition-colors',
            part.met
              ? 'bg-growth-soft font-semibold text-growth-strong'
              : 'bg-surface text-ink-faint ring-1 ring-line-strong hover:text-brand-strong',
          )}
        >
          {checkText(rowType, part.met)}
        </button>
      </span>
    );
  }

  if (part.input === 'counter') {
    return (
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="inline-flex items-center overflow-hidden rounded-full ring-1 ring-line-strong">
          <button
            type="button"
            data-part-minus
            data-part-key={part.key}
            aria-label="减少"
            onClick={() => onBump(part.key, -1)}
            className="px-1.5 text-ui-2xs text-ink-faint hover:bg-surface-soft"
          >
            −
          </button>
          <span
            data-part-value
            data-part-key={part.key}
            className={cn(
              'min-w-[42px] px-1 text-center text-ui-2xs tabular-nums',
              part.met ? 'bg-growth-soft font-semibold text-growth-strong' : 'text-ink',
            )}
          >
            {part.value} / {part.target}
          </span>
          <button
            type="button"
            data-part-plus
            data-part-key={part.key}
            aria-label="增加"
            onClick={() => onBump(part.key, 1)}
            className="px-1.5 text-ui-2xs text-ink-faint hover:bg-surface-soft"
          >
            +
          </button>
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <input
        type="number"
        min={0}
        data-part-number
        data-part-key={part.key}
        value={part.value}
        onChange={(event) => onValue(part.key, Number(event.target.value))}
        className={cn(
          'w-[72px] rounded-ui-xs border border-line-strong px-1.5 py-0.5 text-ui-2xs tabular-nums',
          part.met ? 'bg-growth-soft text-growth-strong' : 'bg-surface text-ink',
        )}
      />
      <span className="text-ui-2xs text-ink-faint">/ {part.target}</span>
    </span>
  );
}

/** One condition row. Notes never reach this component: they are pure index
 *  rows with zero state, rendered by NoticeCard. */
export default function ConditionRow({ item, onCheck, onBump, onValue }: Props) {
  const { row, parts, met, shared, ownerLabel } = item;
  const showLabel = row.type === 'cert' || parts.length > 1;

  return (
    <div
      data-condition-row
      data-row-id={row.id}
      data-row-met={met ? 'yes' : 'no'}
      data-row-shared={shared ? 'yes' : 'no'}
      data-row-scope={row.scope}
      className={cn(
        'rounded-ui-sm border-l-2 px-2.5 py-1.5',
        met ? 'border-growth bg-growth-soft/50' : 'border-line-strong bg-surface',
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 text-ui-xs leading-[1.5] text-ink">{row.name}</span>
        {shared && (
          <span
            data-shared-badge
            className="shrink-0 rounded-full bg-brand-soft px-1.5 text-ui-2xs text-brand-strong"
            title="这一条在多张通告卡之间共用一份状态，改一处全部同步"
          >
            共享
          </span>
        )}
        {row.link && (
          <a
            href={row.link.href}
            className="shrink-0 text-ui-2xs text-brand hover:underline"
            title="查看攻略原文"
          >
            攻略 ›
          </a>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          data-owner-label
          className="max-w-[150px] shrink-0 truncate rounded-full bg-surface-soft px-1.5 text-ui-2xs text-ink-faint"
          title={`归属：${ownerLabel}`}
        >
          读：{ownerLabel}
        </span>
        {row.hint && row.hint !== '-' && (
          <span className="min-w-0 flex-1 truncate text-ui-2xs text-ink-faint" title={row.hint}>
            {row.hint}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {parts.map((part) => (
          <PartControl
            key={part.key}
            part={part}
            rowType={row.type}
            showLabel={showLabel}
            onCheck={onCheck}
            onBump={onBump}
            onValue={onValue}
          />
        ))}
      </div>
      {parts.filter((part) => part.gaps?.length).map((part) => (
        <div
          key={part.key}
          data-cert-gaps
          title={`${part.label}：${part.gaps?.join(' · ')}`}
          className="mt-1 line-clamp-2 text-ui-2xs leading-[1.6] text-ink-faint"
        >
          <span className="font-semibold text-ink-muted">{part.label}：</span>
          {part.gaps?.join(' · ')}
        </div>
      ))}
    </div>
  );
}
