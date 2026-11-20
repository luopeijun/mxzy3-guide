import { useEffect, useMemo, useRef, useState } from 'react';
import { useSpecialsData } from '../../hooks/useSpecialsData';
import { cn } from '../../lib/cn';
import { workRoleClass } from '../../lib/workRoleStyle';
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

/** 艺人胶囊的自定义 hover 浮层：男主角 / 男配角两坑位各自列差值。
 *  原生 title 又慢又不能排版，这里用浮层卡片，跟随胶囊位置。 */
function MatchHoverCard({
  match,
  anchor,
  onEnter,
  onLeave,
}: {
  match: ArtistMatch;
  anchor: { left: number; top: number };
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      data-case-special-hover
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-50 w-[300px] -translate-x-full rounded-ui-md border border-line-strong bg-canvas p-2.5 shadow-soft"
      style={{ left: anchor.left - 8, top: anchor.top }}
    >
      <p className="mb-1.5 text-ui-xs font-semibold text-ink">{match.name}</p>
      {match.slots.length ? match.slots.map((slot) => (
        <div key={slot.label} className="mb-1.5 last:mb-0">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className={cn('text-ui-2xs', workRoleClass(slot.label))}>{slot.label}</span>
            <span className="text-ui-2xs text-ink-faint">{slot.met}/{slot.total}</span>
          </div>
          {slot.gaps.length ? (
            <div className="space-y-0.5 text-ui-2xs leading-relaxed text-ink-muted">
              {slot.gaps.map((gap, index) => <div key={index}>· {gap}</div>)}
            </div>
          ) : (
            <div className="text-ui-2xs text-growth-strong">全部达标</div>
          )}
        </div>
      )) : (
        <p className="text-ui-2xs text-ink-muted">
          {match.gaps.length ? `待补：${match.gaps.join('、')}` : '全部达标'}
        </p>
      )}
    </div>
  );
}

/** 节点正文：「书名号」里的歌曲 / 剧本是重点奖励，用金色区分。 */
function NodeText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(「[^」]+」)/g).map((part, index) => part.startsWith('「') && part.endsWith('」')
        ? <span key={index} className="font-semibold text-title-star">{part}</span>
        : <span key={index}>{part}</span>)}
    </>
  );
}

function DetailSection({
  report,
  expanded,
  onToggle,
  onMatchHover,
  dataError,
}: {
  report: LiveSpecialsReport | null;
  expanded: string;
  onToggle: (id: string) => void;
  onMatchHover: (match: ArtistMatch | null, anchor: { left: number; top: number }) => void;
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
        const filmed = item.filmed;

        return (
          <div
            key={item.notice.id}
            data-case-special-notice={item.notice.id}
            data-case-special-status={item.status}
            data-case-special-filmed={filmed.length > 0 ? 'true' : 'false'}
            className="rounded-ui-sm border border-line bg-surface"
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggle(item.notice.id)}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-soft"
            >
              {filmed.length > 0 ? (
                <span aria-hidden="true" className="shrink-0 text-ui-sm font-semibold text-growth-strong">✓</span>
              ) : (
                <i className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[item.status])} />
              )}
              <span className="w-[92px] shrink-0 truncate text-ui-xs font-semibold text-ink">
                {item.notice.title}
              </span>
              {item.nodes.length > 0 ? (
                <span className="flex-1 text-right text-ui-2xs text-ink-faint">按事件节点推进</span>
              ) : (
                <>
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
                </>
              )}
              <span className="w-3 shrink-0 text-center text-ui-2xs text-ink-faint">
                {open ? '−' : '+'}
              </span>
            </button>

            {open && (
              <div className="border-t border-line px-2.5 pb-2.5 pt-2">
                {filmed.length > 0 && (
                  <div className="mb-2 text-ui-2xs leading-relaxed" data-case-special-filmed-record>
                    <p className="mb-1">
                      <span className="inline-flex rounded border border-growth-line bg-growth-soft px-1.5 py-0.5 font-semibold text-growth-strong">已拍摄</span>
                    </p>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {filmed.map((record, index) => (
                        <span key={`${record.name}-${record.date}-${record.role}-${index}`} className="inline-flex items-baseline gap-1 text-ink-muted">
                          {record.role && (
                            <span className="rounded border border-growth-line px-1 font-semibold text-growth-strong">
                              {record.role}
                            </span>
                          )}
                          <span className={cn('text-ink', record.own && 'font-semibold')}>{record.name}</span>
                          {record.date && <span className="text-ink-faint">{record.date}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(item.nodes.length > 0 || manual.length > 0) && (
                  <div className="mb-2" data-case-special-nodes>
                    <p className="mb-1 text-ui-2xs font-semibold text-ink">
                      关键事件节点 <span className="font-normal text-ink-faint">· 存档无法判定</span>
                    </p>
                    <div className="space-y-1 text-ui-2xs leading-relaxed text-ink-muted">
                      {item.nodes.length > 0
                        ? item.nodes.map((row, index) => (
                          <div key={row.id} data-case-special-node={row.id} className="flex gap-1.5">
                            <span className="shrink-0 text-ink-faint">{index + 1}.</span>
                            <span>
                              {row.target !== '-' && row.target && (
                                <span className="mr-1 rounded bg-brand-soft px-1 font-semibold text-brand-strong">{row.target}</span>
                              )}
                              <NodeText text={row.name} />
                            </span>
                          </div>
                        ))
                        : manual.map((condition, index) => (
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
                        {entry.name}{entry.optional && '（可选）'}
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
                          className={cn(
                            'cursor-help inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-ui-2xs',
                            match.met === match.total
                              ? 'border-growth-line bg-growth-soft font-semibold text-growth-strong'
                              : 'border-line bg-surface-soft text-ink',
                          )}
                          onMouseEnter={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            onMatchHover(match, { left: rect.left, top: rect.top });
                          }}
                          onMouseLeave={() => onMatchHover(null, { left: 0, top: 0 })}
                        >
                          {match.met === match.total && <span aria-hidden="true">✓</span>}
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

export default function CaseSpecialsAssistant({ result, tables }: Props) {
  const { data, error } = useSpecialsData(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState('');
  const [hover, setHover] = useState<{ match: ArtistMatch; anchor: { left: number; top: number } } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const showHover = (match: ArtistMatch, anchor: { left: number; top: number }) => {
    clearHoverTimer();
    setHover({ match, anchor });
  };
  /** 胶囊离开后留一点时间让鼠标挪进浮层；浮层自己接管后再真正关闭。 */
  const hideHoverSoon = () => {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => setHover(null), 180);
  };
  const hideHoverNow = () => {
    clearHoverTimer();
    setHover(null);
  };
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

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
            {report && (
              <span
                className="rounded-full border border-growth-line bg-growth-soft px-1.5 py-0.5 text-ui-2xs font-semibold text-growth-strong"
                data-case-assistant-progress
              >
                {report.doneCount}/6
              </span>
            )}
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

          {!result && (
            <p className="px-3 pb-3 text-ui-2xs text-ink-faint">先载入一份存档，就能看到六大目标的实时完成程度。</p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" onScroll={hideHoverNow}>
            {result && (
              <DetailSection
                report={report}
                expanded={expanded}
                onToggle={(id) => setExpanded((current) => (current === id ? '' : id))}
                onMatchHover={(match, anchor) => {
                  if (match) showHover(match, anchor);
                  else hideHoverSoon();
                }}
                dataError={error}
              />
            )}
          </div>
        </section>
      )}

      {open && hover && (
        <MatchHoverCard
          match={hover.match}
          anchor={hover.anchor}
          onEnter={clearHoverTimer}
          onLeave={hideHoverNow}
        />
      )}

      <button
        type="button"
        data-case-special-orb
        aria-label="打开六大通告助手"
        aria-expanded={open}
        onClick={() => {
          setHover(null);
          setOpen((value) => !value);
        }}
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
