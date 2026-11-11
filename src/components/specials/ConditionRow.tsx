import { useState } from 'react';
import type { RowEval, EvalPart } from '../../lib/specialsState';
import { cn } from '../../lib/cn';

interface Props {
  item: RowEval;
  onCheck: (key: string) => void;
  onBump: (key: string, delta: number) => void;
  onValue: (key: string, value: number) => void;
  onDone: (rowId: string) => void;
  onStat: (artistId: string, attr: string, value: number | null) => void;
}

function statKeyParts(key: string): { artistId: string; attr: string } | null {
  const parts = key.split(':');
  if (parts[0] !== 'stat' || parts.length < 3) return null;
  return { artistId: parts[1], attr: parts[2] };
}

/** A number input for the optional "check the gap" peek on a stat / resource
 *  row. Numbers never gate the checklist; they just remind you how far off. */
function NumberPeek({ part, onStat, onValue }: { part: EvalPart; onStat: Props['onStat']; onValue: Props['onValue'] }) {
  const stat = part.input === 'number' ? statKeyParts(part.key) : null;
  if (stat) {
    return (
      <label className="inline-flex items-center gap-1 text-ui-2xs text-ink-muted">
        <span className="max-w-[78px] truncate">{part.label}</span>
        <input
          type="number"
          min={0}
          data-stat-input
          data-part-key={part.key}
          defaultValue={part.value || ''}
          placeholder="—"
          onBlur={(event) => {
            const raw = event.target.value;
            if (raw === '') onStat(stat.artistId, stat.attr, null);
            else onStat(stat.artistId, stat.attr, Math.max(0, Number(raw)));
          }}
          className="w-[64px] rounded-ui-xs border border-line-strong bg-surface px-1.5 py-0.5 tabular-nums text-ink"
        />
        <span className="text-ink-faint">/ {part.target}</span>
      </label>
    );
  }
  return (
    <label className="inline-flex items-center gap-1 text-ui-2xs text-ink-muted">
      <span className="max-w-[78px] truncate">{part.label}</span>
      <input
        type="number"
        min={0}
        data-part-number
        data-part-key={part.key}
        defaultValue={part.value || ''}
        placeholder="—"
        onBlur={(event) => {
          const raw = event.target.value;
          onValue(part.key, raw === '' ? 0 : Math.max(0, Number(raw)));
        }}
        className="w-[84px] rounded-ui-xs border border-line-strong bg-surface px-1.5 py-0.5 tabular-nums text-ink"
      />
      <span className="text-ink-faint">/ {part.target}</span>
    </label>
  );
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
          {rowType === 'cert' ? (part.met ? '✓ 已取得' : '○ 未取得') : part.met ? '✓ 已完成' : '○ 待确认'}
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
  // number: kept behind the row's expand toggle for stat / resource rows.
  return (
    <NumberPeek part={part} onStat={() => {}} onValue={onValue} />
  );
}

/** One condition row — compact single line.
 *  - The name + its status (tick / 已取得 / counter) are the primary signal.
 *  - The owner is a tiny inline tag; the hint moves to a hover title.
 *  - stat / resource rows are a plain checklist tick; numbers are an optional,
 *    expandable peek. Certificate gaps show a one-line "还差 N 项" and the full
 *    breakdown stays behind the ▸ toggle. No red "差 80" wall, no forced entry. */
export default function ConditionRow({ item, onCheck, onBump, onValue, onDone, onStat }: Props) {
  const { row, parts, met, shared, ownerLabel, doneEligible } = item;
  const [expanded, setExpanded] = useState(false);
  const showLabel = row.type === 'cert' || parts.length > 1;
  const numberPeek = doneEligible && parts.some((part) => part.input === 'number');
  const gapPeek = !doneEligible && parts.some((part) => part.gaps?.length);
  const showOwner = !!ownerLabel && ownerLabel !== '按艺人';

  const line = (children: React.ReactNode) => (
    <div className="flex items-center gap-2">
      {children}
    </div>
  );

  if (doneEligible) {
    return (
      <div
        data-condition-row
        data-row-id={row.id}
        data-row-met={met ? 'yes' : 'no'}
        data-row-shared={shared ? 'yes' : 'no'}
        data-row-scope={row.scope}
        className={cn(
          'rounded-ui-sm border-l-2 px-2.5 py-1',
          met ? 'border-growth bg-growth-soft/50' : 'border-line-strong bg-surface',
        )}
      >
        {line(
          <>
            <input
              type="checkbox"
              data-done-toggle
              data-row-id={row.id}
              checked={met}
              onChange={() => onDone(row.id)}
              style={{ accentColor: 'var(--color-brand)' }}
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            />
            <span
              className="min-w-0 flex-1 truncate text-ui-xs leading-[1.4] text-ink"
              title={row.hint && row.hint !== '-' ? row.hint : undefined}
            >
              {row.name}
            </span>
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
              <a href={row.link.href} className="shrink-0 text-ui-2xs text-brand hover:underline" title="查看攻略原文">
                攻略 ›
              </a>
            )}
            {showOwner && (
              <span
                data-owner-label={ownerLabel}
                className="shrink-0 truncate text-ui-2xs text-ink-faint"
                title={`归属：${ownerLabel}`}
              >
                {ownerLabel}
              </span>
            )}
            {numberPeek && (
              <button
                type="button"
                data-peek-toggle
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
                className="shrink-0 text-ui-2xs text-ink-faint hover:text-brand-strong"
                title="填数值看还差多少（可选）"
              >
                {expanded ? '▾' : '▸'}
              </button>
            )}
          </>,
        )}
        {expanded && numberPeek && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6" data-peek-list>
            {parts.map((part) => (
              <NumberPeek key={part.key} part={part} onStat={onStat} onValue={onValue} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-condition-row
      data-row-id={row.id}
      data-row-met={met ? 'yes' : 'no'}
      data-row-shared={shared ? 'yes' : 'no'}
      data-row-scope={row.scope}
      className={cn(
        'rounded-ui-sm border-l-2 px-2.5 py-1',
        met ? 'border-growth bg-growth-soft/50' : 'border-line-strong bg-surface',
      )}
    >
      {line(
        <>
          <span
            className="min-w-0 flex-1 truncate text-ui-xs leading-[1.4] text-ink"
            title={row.hint && row.hint !== '-' ? row.hint : undefined}
          >
            {row.name}
          </span>
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
            <a href={row.link.href} className="shrink-0 text-ui-2xs text-brand hover:underline" title="查看攻略原文">
              攻略 ›
            </a>
          )}
          {showOwner && (
            <span
              data-owner-label={ownerLabel}
              className="shrink-0 truncate text-ui-2xs text-ink-faint"
              title={`归属：${ownerLabel}`}
            >
              {ownerLabel}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1.5">
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
          </span>
          {gapPeek && (
            <button
              type="button"
              data-peek-toggle
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="shrink-0 text-ui-2xs text-ink-faint hover:text-brand-strong"
              title="查看属性 / 课程缺口详情"
            >
              {expanded ? '▾' : '▸'}
            </button>
          )}
        </>,
      )}
      {expanded && gapPeek && (
        <div className="mt-1 space-y-0.5 pl-6" data-peek-list>
          {parts.filter((part) => part.gaps?.length).map((part) => (
            <div
              key={part.key}
              data-cert-gaps
              title={`${part.label}：${part.gaps?.join(' · ')}`}
              className="truncate text-ui-2xs leading-[1.5] text-ink-faint"
            >
              <span className="font-semibold text-ink-muted">{part.label}：</span>
              {part.gaps?.join(' · ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
