import { useEffect, useMemo, useRef, useState } from 'react';
import { useSpecialsData } from '../../hooks/useSpecialsData';
import { cn } from '../../lib/cn';
import {
  evaluateLiveSpecials,
  LIVE_STATUS_LABELS,
  type ArtistMatch,
  type LiveNoticeStatus,
  type LiveSpecialsReport,
} from '../../lib/caseSpecials';
import type { CaseTables, ParseResult } from '../../lib/caseParser';

interface Props {
  result: ParseResult | null;
  tables: CaseTables;
}

const STATUS_DOT: Record<LiveNoticeStatus, string> = {
  done: 'bg-brand',
  close: 'bg-alert',
  progress: 'bg-tag-talk',
  none: 'bg-line-strong',
  manual: 'bg-ink-faint',
};

function statusRank(status: LiveNoticeStatus): number {
  return { close: 0, progress: 1, none: 2, manual: 3, done: 4 }[status];
}

/** hover 文案：男主角 / 男配角分开列，缺的每一项都带具体数值差。 */
function matchTitle(match: ArtistMatch): string {
  if (!match.slots.length) {
    return match.gaps.length ? `待补：${match.gaps.join('、')}` : '全部达标';
  }
  return match.slots
    .map((slot) => `${slot.label} ${slot.met}/${slot.total}${slot.gaps.length ? `：${slot.gaps.join('；')}` : '：达标'}`)
    .join('\n');
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-ui-sm bg-surface-soft px-2.5 py-2">
      <div className="text-ui-2xs text-ink-faint">{label}</div>
      <div className="text-[20px] font-semibold leading-tight text-ink">{value}</div>
    </div>
  );
}

function DetailSection({
  report,
  expanded,
  onToggle,
  dataError,
}: {
  report: LiveSpecialsReport | null;
  expanded: string;
  onToggle: (id: string) => void;
  dataError: string | null;
}) {
  if (dataError) {
    return <p className="px-1 py-4 text-ui-2xs text-alert">条件表读取失败：{dataError}</p>;
  }
  if (!report) {
    return <p className="px-1 py-4 text-ui-2xs text-ink-faint">正在读取六大目标条件…</p>;
  }

  return (
    <div className="space-y-1">
      {report.notices.map((item) => {
        const open = expanded === item.notice.id;
        const manual = item.conditions.filter((condition) => condition.state === 'manual');

        return (
          <div
            key={item.notice.id}
            data-case-special-notice={item.notice.id}
            data-case-special-status={item.status}
            className="rounded-ui-sm border border-line bg-surface"
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggle(item.notice.id)}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-soft"
            >
              <i className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[item.status])} />
              <span className="w-[92px] shrink-0 truncate text-ui-xs font-semibold text-ink">
                {item.notice.title}
              </span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-soft">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${item.total ? Math.round(item.met / item.total * 100) : 0}%` }}
                />
              </span>
              <span className="w-[30px] shrink-0 text-right text-ui-2xs text-ink-faint">
                {item.total ? `${item.met}/${item.total}` : '—'}
              </span>
              <span className="w-[76px] shrink-0 text-right text-ui-2xs text-ink-muted">
                {LIVE_STATUS_LABELS[item.status]}
              </span>
              <span className="w-3 shrink-0 text-center text-ui-2xs text-ink-faint">
                {open ? '−' : '+'}
              </span>
            </button>

            {open && (
              <div className="border-t border-line px-2.5 pb-2.5 pt-2">
                {manual.length > 0 && (
                  <div className="mb-2" data-case-special-nodes>
                    <p className="mb-1 text-ui-2xs font-semibold text-ink">
                      关键事件节点 <span className="font-normal text-ink-faint">· 存档无法判定</span>
                    </p>
                    <div className="space-y-0.5 text-ui-2xs leading-relaxed text-ink-muted">
                      {manual.map((condition, index) => (
                        <div key={condition.row.id} data-case-special-node={condition.row.id} className="flex gap-1.5">
                          <span className="shrink-0 text-ink-faint">{index + 1}.</span>
                          <span>{condition.row.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {item.items.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1" data-case-special-items>
                    <span className="mr-0.5 text-ui-2xs text-ink-faint">所需道具</span>
                    {item.items.map((entry) => (
                      <span
                        key={entry.name}
                        data-case-special-item={entry.name}
                        data-case-special-item-met={entry.met}
                        className={cn(
                          'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-ui-2xs',
                          entry.met
                            ? 'border-growth-line bg-growth-soft font-semibold text-growth-strong'
                            : 'border-line bg-surface-soft text-ink-muted',
                        )}
                      >
                        {entry.met && <span aria-hidden="true">✓</span>}
                        {entry.name}
                      </span>
                    ))}
                  </div>
                )}

                {(item.matches.length > 0 || item.groups.length > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1" data-case-special-matches>
                    <span className="mr-0.5 text-ui-2xs text-ink-faint">
                      {item.groups.length ? '团体匹配' : '艺人匹配'}
                    </span>
                    {item.groups.length > 0
                      ? item.groups.slice(0, 2).map((group) => (
                        <span
                          key={group.code}
                          className="rounded-full border border-line bg-surface-soft px-1.5 py-0.5 text-ui-2xs text-ink"
                          title={group.gaps.length ? `待补：${group.gaps.join('、')}` : '全部达标'}
                        >
                          {group.name} {group.met}/{group.total}
                        </span>
                      ))
                      : item.matches.map((match) => (
                        <span
                          key={match.id}
                          data-case-special-match={match.id}
                          className="rounded-full border border-line bg-surface-soft px-1.5 py-0.5 text-ui-2xs text-ink"
                          title={matchTitle(match)}
                        >
                          {match.name} {match.met}/{match.total}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CaseSpecialsAssistant({ result, tables, onJump }: Props) {
  const { data, error } = useSpecialsData(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const report = useMemo(
    () => (data && result ? evaluateLiveSpecials(data, result, tables) : null),
    [data, result, tables],
  );

  useEffect(() => {
    if (!report || !report.notices.length) return;
    setExpanded((current) => {
      if (current && report.notices.some((item) => item.notice.id === current)) return current;
      const best = [...report.notices].sort((a, b) =>
        statusRank(a.status) - statusRank(b.status) || b.met - a.met)[0];
      return best?.notice.id ?? '';
    });
  }, [report]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const badge = report ? `${report.doneCount}/6` : '';

  return (
    <div ref={rootRef} data-case-special-assistant className="fixed bottom-16 right-5 z-30 min-[1120px]:right-[280px]">
      {open && (
        <section
          data-case-special-panel
          aria-label="六大通告助手"
          className="absolute bottom-[68px] right-0 flex max-h-[min(72vh,560px)] w-[min(440px,calc(100vw-40px))] flex-col overflow-hidden rounded-ui-md border border-line-strong bg-canvas shadow-soft"
        >
          <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
            <span className="text-ui-sm font-semibold text-brand-strong">六大通告助手</span>
            <span className="ml-auto rounded-full border border-line px-1.5 py-0.5 text-ui-2xs text-ink-faint">
              基于当前存档
            </span>
            <button
              type="button"
              aria-label="关闭六大通告助手"
              onClick={() => setOpen(false)}
              className="rounded px-1 text-ui-xs text-ink-faint transition-colors hover:bg-surface-soft hover:text-ink"
            >
              ×
            </button>
          </div>

          <div className="flex gap-2 px-3 py-2">
            <SummaryBox label="已达成" value={report ? `${report.doneCount} / 6` : '—'} />
            <SummaryBox label="差一项" value={report ? String(report.closeCount) : '—'} />
            <SummaryBox label="待推进" value={report ? String(report.pendingCount) : '—'} />
          </div>

          {!result && (
            <p className="px-3 pb-3 text-ui-2xs text-ink-faint">先载入一份存档，就能看到六大目标的实时完成程度。</p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {result && (
              <DetailSection
                report={report}
                expanded={expanded}
                onToggle={(id) => setExpanded((current) => (current === id ? '' : id))}
                onJump={(target) => {
                  onJump(target);
                  setOpen(false);
                }}
                dataError={error}
              />
            )}
          </div>
        </section>
      )}

      <button
        type="button"
        data-case-special-orb
        aria-label="打开六大通告助手"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'relative ml-auto flex h-[54px] w-[60px] items-center justify-center transition-transform duration-150 hover:-translate-y-0.5 hover:scale-105',
          open && 'drop-shadow-[0_2px_5px_rgba(192,48,111,0.35)]',
        )}
      >
        <img src="/six-notice-mascot.png" alt="" className="h-full w-full object-contain" draggable={false} />
        {badge && (
          <span className="absolute -right-1 -top-0.5 min-w-[20px] rounded-full border border-brand-line bg-brand-soft px-1 text-center text-[10px] leading-[16px] text-brand-strong">
            {badge}
          </span>
        )}
      </button>
    </div>
  );
}
