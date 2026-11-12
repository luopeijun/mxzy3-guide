import { useMemo, useState } from 'react';
import type { RowEval, EvalPart } from '../../lib/specialsState';
import { COURSE_LEVELS } from '../../lib/specials';
import { cn } from '../../lib/cn';

interface Props {
  item: RowEval;
  onCheck: (key: string) => void;
  onBump: (key: string, delta: number) => void;
  onValue: (key: string, value: number) => void;
  onDone: (rowId: string) => void;
  onStat: (artistId: string, attr: string, value: number | null) => void;
  onCourse: (artistId: string, course: string) => void;
}

function statKeyParts(key: string): { artistId: string; attr: string } | null {
  const parts = key.split(':');
  if (parts[0] !== 'stat' || parts.length < 3) return null;
  return { artistId: parts[1], attr: parts[2] };
}

/** A number input for the optional "check the gap" peek on a stat / resource
 *  row. Numbers never gate the checklist; they just remind you how far off. */
function NumberPeek({
  part, hideLabel, onStat, onValue,
}: {
  part: EvalPart;
  hideLabel?: boolean;
  onStat: Props['onStat'];
  onValue: Props['onValue'];
}) {
  const stat = part.input === 'number' ? statKeyParts(part.key) : null;
  if (stat) {
    return (
      <label className="inline-flex items-center gap-1 text-ui-2xs text-ink-muted">
        {!hideLabel && <span className="max-w-[78px] truncate">{part.label}</span>}
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
      {!hideLabel && <span className="max-w-[78px] truncate">{part.label}</span>}
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
  return <NumberPeek part={part} hideLabel onStat={() => {}} onValue={onValue} />;
}

/** Course chips + attribute gaps behind a certificate row's ▸ toggle. */
function GapDetail({
  parts, onCourse,
}: {
  parts: EvalPart[];
  onCourse: Props['onCourse'];
}) {
  return (
    <div className="mt-1 space-y-1 pl-6" data-peek-list>
      {parts.filter((part) => part.courseList?.length || part.gaps?.length).map((part) => (
        <div key={part.key} className="space-y-0.5">
          {part.courseList?.length ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-ui-2xs text-ink-faint">课程</span>
              {part.courseList.map((cg) => {
                const reached = COURSE_LEVELS.indexOf(cg.current) >= COURSE_LEVELS.indexOf(cg.required);
                return (
                  <button
                    key={cg.course}
                    type="button"
                    data-course-chip
                    data-course={cg.course}
                    data-artist={part.ownerId}
                    onClick={() => onCourse(part.ownerId ?? '', cg.course)}
                    title={`要求 ${cg.required} · 点一下升一级`}
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-ui-2xs',
                      reached ? 'bg-growth-soft font-semibold text-growth-strong' : 'bg-surface text-ink-faint ring-1 ring-line-strong',
                    )}
                  >
                    {cg.course} {cg.current}
                  </button>
                );
              })}
            </div>
          ) : null}
          {part.gaps?.length ? (
            <div
              data-cert-gaps
              title={`${part.label}：${part.gaps.join(' · ')}`}
              className="truncate text-ui-2xs leading-[1.5] text-ink-faint"
            >
              <span className="font-semibold text-ink-muted">属性缺口：</span>
              {part.gaps.join(' · ')}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** One condition row — compact single line.
 *  - The name + its status (tick / 已取得 / counter) are the primary signal.
 *  - The owner is a tiny inline tag; the hint moves to a hover title.
 *  - A row that fans out over several artists (a candidate pool such as
 *    末日战士) splits into one line per artist instead of cramming every
 *    control into one row.
 *  - stat / resource rows are a plain checklist tick; numbers are an optional,
 *    expandable peek. Certificate gaps show a one-line "还差 N 项" and the full
 *    breakdown stays behind the ▸ toggle. No red "差 80" wall, no forced entry. */
export default function ConditionRow({ item, onCheck, onBump, onValue, onDone, onStat, onCourse }: Props) {
  const { row, parts, met, shared, ownerLabel, doneEligible } = item;
  const [peek, setPeek] = useState<string | null>(null);
  const toggle = (key: string) => setPeek((current) => (current === key ? null : key));
  const showLabel = row.type === 'cert' || parts.length > 1;

  // Group parts by artist, then fan out one sub-line per *thing to check*: a
  // candidate pool gives one line per artist, and one role that needs two
  // certificates gives one line per certificate. Nothing is stacked into a
  // single stretched-out row.
  const ownerGroups = useMemo(() => {
    const map = new Map<string, EvalPart[]>();
    for (const part of parts) {
      if (!part.ownerId) continue;
      const list = map.get(part.ownerId) ?? [];
      list.push(part);
      map.set(part.ownerId, list);
    }
    return [...map.entries()];
  }, [parts]);
  const lines = useMemo(
    () => ownerGroups.flatMap(([ownerId, list]) => (
      list.length > 1
        ? list.map((part) => ({ key: `p:${part.key}`, head: part.label, parts: [part] }))
        : [{ key: `o:${ownerId}`, head: list[0].ownerLabel ?? ownerId, parts: list }]
    )),
    [ownerGroups],
  );
  const multiOwner = ownerGroups.length > 1;
  const split = lines.length > 1;
  // 「男主：戏剧 + 音乐证书」 already names the role — do not repeat it as a tag.
  const showOwner = !split && !!ownerLabel && ownerLabel !== '按艺人' && !row.name.includes(ownerLabel);

  // 「提前准备」里的道具 / 前置计数行常驻一行灰色备注：hint 就是这张表里
  // 写好的获取来源（哪个综艺的奖品、在哪买、跟谁拿），不用再 hover 才看见。
  // 证书行不重复铺——它的课程与属性缺口已经在 ▸ 展开里。
  const sourceNote = row.phase === 'prepare' && (row.type === 'item' || row.type === 'count')
    && row.hint && row.hint !== '-' ? row.hint : null;
  const noteLine = sourceNote ? (
    <p
      data-item-source
      title={sourceNote}
      className="mt-0.5 pl-1 text-ui-2xs leading-[1.45] text-ink-faint"
    >
      <span aria-hidden="true" className="mr-1">↳</span>
      {sourceNote}
    </p>
  ) : null;

  const shell = cn(
    'rounded-ui-sm border-l-2 px-2.5 py-1',
    met ? 'border-growth bg-growth-soft/50' : 'border-line-strong bg-surface',
  );

  const headMeta = (
    <>
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
    </>
  );

  if (doneEligible) {
    const numberPeek = parts.some((part) => part.input === 'number');
    return (
      <div
        data-condition-row
        data-row-id={row.id}
        data-row-met={met ? 'yes' : 'no'}
        data-row-shared={shared ? 'yes' : 'no'}
        data-row-scope={row.scope}
        className={shell}
      >
        <div className="flex items-center gap-2">
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
          {headMeta}
          {numberPeek && (
            <button
              type="button"
              data-peek-toggle
              aria-expanded={peek === 'row'}
              onClick={() => toggle('row')}
              className="shrink-0 text-ui-2xs text-ink-faint hover:text-brand-strong"
              title="填数值看还差多少（可选）"
            >
              {peek === 'row' ? '▾' : '▸'}
            </button>
          )}
        </div>
        {noteLine}
        {peek === 'row' && numberPeek && (
          <div className="mt-1 space-y-1 pl-6" data-peek-list>
            {parts.map((part) => (
              <div key={part.key} className="flex items-center gap-2">
                {multiOwner && (
                  <span className="w-[52px] shrink-0 truncate text-ui-2xs text-ink-faint">
                    {part.ownerLabel ?? part.label}
                  </span>
                )}
                <NumberPeek part={part} hideLabel={multiOwner} onStat={onStat} onValue={onValue} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Candidate pool / one role needing several certificates: one sub-line each.
  if (split) {
    return (
      <div
        data-condition-row
        data-row-id={row.id}
        data-row-met={met ? 'yes' : 'no'}
        data-row-shared={shared ? 'yes' : 'no'}
        data-row-scope={row.scope}
        className={shell}
      >
        <div className="flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-ui-xs leading-[1.4] text-ink"
            title={row.hint && row.hint !== '-' ? row.hint : undefined}
          >
            {row.name}
          </span>
          {headMeta}
          {multiOwner && (
            <span data-owner-count className="shrink-0 text-ui-2xs text-ink-faint">
              {ownerGroups.length} 人
            </span>
          )}
        </div>
        {noteLine}
        <div data-owner-parts className="mt-1 space-y-1 border-t border-line/60 pt-1">
          {lines.map((line) => {
            const hasGap = line.parts.some((part) => part.gaps?.length || part.courseList?.length);
            const ownerId = line.parts[0].ownerId ?? line.key;
            return (
              <div key={line.key} data-owner-part data-artist-id={ownerId}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ui-2xs text-ink-muted">
                    {line.head}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {line.parts.map((part) => (
                      <PartControl
                        key={part.key}
                        part={part}
                        rowType={row.type}
                        showLabel={false}
                        onCheck={onCheck}
                        onBump={onBump}
                        onValue={onValue}
                      />
                    ))}
                  </span>
                  {hasGap && (
                    <button
                      type="button"
                      data-peek-toggle
                      aria-expanded={peek === line.key}
                      onClick={() => toggle(line.key)}
                      className="shrink-0 text-ui-2xs text-ink-faint hover:text-brand-strong"
                      title="查看属性 / 课程缺口详情"
                    >
                      {peek === line.key ? '▾' : '▸'}
                    </button>
                  )}
                </div>
                {peek === line.key && hasGap && <GapDetail parts={line.parts} onCourse={onCourse} />}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const gapPeek = parts.some((part) => part.gaps?.length || part.courseList?.length);

  return (
    <div
      data-condition-row
      data-row-id={row.id}
      data-row-met={met ? 'yes' : 'no'}
      data-row-shared={shared ? 'yes' : 'no'}
      data-row-scope={row.scope}
      className={shell}
    >
      <div className="flex items-center gap-2">
        <span
          className="min-w-0 flex-1 truncate text-ui-xs leading-[1.4] text-ink"
          title={row.hint && row.hint !== '-' ? row.hint : undefined}
        >
          {row.name}
        </span>
        {headMeta}
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
            aria-expanded={peek === 'row'}
            onClick={() => toggle('row')}
            className="shrink-0 text-ui-2xs text-ink-faint hover:text-brand-strong"
            title="查看属性 / 课程缺口详情"
          >
            {peek === 'row' ? '▾' : '▸'}
          </button>
        )}
      </div>
      {noteLine}
      {peek === 'row' && gapPeek && <GapDetail parts={parts} onCourse={onCourse} />}
    </div>
  );
}
