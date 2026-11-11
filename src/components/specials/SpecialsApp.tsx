import { useMemo, useState } from 'react';
import type { GuideData } from '../../types/guide';
import type { SpecialsData } from '../../types/specials';
import { listArtists } from '../../lib/tracker';
import { useTracker } from '../../hooks/useTracker';
import { useSpecials } from '../../hooks/useSpecials';
import { evaluateBoard, noticeProgress } from '../../lib/specialsState';
import { cn } from '../../lib/cn';
import NoticeCard from './NoticeCard';

interface Props {
  data: SpecialsData;
  guide: GuideData;
}

/** 六大通告条件看板。定位是「状态面板」，不是流程管理器：
 *  - 卡级指派决定每一条条件读谁的数值；
 *  - 属性 / 课程 / 计数 / 道具 / 证书只存一份，多张卡引用同一份状态；
 *  - 时间线备注零状态、零计数，只作为跳回事件追踪器的索引。 */
export default function SpecialsApp({ data, guide }: Props) {
  const { selectedArtists } = useTracker();
  const board = useSpecials();
  const { state } = board;
  const [hideDone, setHideDone] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const allArtists = useMemo(() => listArtists(guide), [guide]);
  const titles = useMemo(() => new Map(allArtists.map((artist) => [artist.id, artist.title])), [allArtists]);
  const rosterArtists = useMemo(
    () => allArtists.filter((artist) => selectedArtists.includes(artist.id)),
    [allArtists, selectedArtists],
  );
  const evaluation = useMemo(() => evaluateBoard(data, state, titles), [data, state, titles]);

  const notices = data.notices.filter((notice) => notice.id !== '_global');
  const globalNotes = data.rows.filter((row) => row.notice === '_global');
  const enabledNotices = notices.filter((notice) => state.enabled.includes(notice.id));
  const totals = enabledNotices.reduce(
    (sum, notice) => {
      const progress = noticeProgress(evaluation.byNotice[notice.id]);
      return { met: sum.met + progress.met, total: sum.total + progress.total };
    },
    { met: 0, total: 0 },
  );
  const notesByNotice = useMemo(() => {
    const map: Record<string, typeof data.rows> = {};
    for (const notice of notices) {
      map[notice.id] = data.rows.filter((row) => row.notice === notice.id && row.kind === 'note');
    }
    return map;
  }, [data.rows, notices]);

  return (
    <div data-specials-app className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col bg-canvas">
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[1560px] px-6 py-6 nav:px-4">
          {/* Heading */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-ui-xl font-bold text-brand-strong">六大通告 · 规划与追踪</h1>
              <p className="mt-1 text-ui-xs text-ink-muted">
                先选人、派通告，再逐个确认：道具、证书、计数凑齐了没。
                证书这一行点开就能勾「已取得」，并逐门点出课程等级（未上 → 初级 → … → 专业）。
                属性门槛默认收起、只是参考、不强制填；事件的时间与步骤在<a href="#/tracker" className="text-brand hover:underline">事件追踪器</a>里跟，这里不重复打勾。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span data-board-progress data-met={totals.met} data-total={totals.total} className="rounded-full bg-surface px-3 py-1.5 text-ui-xs text-ink-muted shadow-soft">
                已启用 <b className="text-brand-strong">{enabledNotices.length}</b> / 6 · 凑齐{' '}
                <b className="text-growth-strong">{totals.met}</b> / {totals.total} 条
              </span>
              <label className="flex cursor-pointer items-center gap-1.5 text-ui-xs text-ink-faint">
                <input
                  type="checkbox"
                  data-hide-done
                  checked={hideDone}
                  onChange={(event) => setHideDone(event.target.checked)}
                  style={{ accentColor: 'var(--color-brand)' }}
                  className="h-3.5 w-3.5"
                />
                收起已完成
              </label>
              <button
                type="button"
                data-reset
                onClick={() => {
                  if (confirmReset) {
                    board.reset();
                    setConfirmReset(false);
                  } else {
                    setConfirmReset(true);
                  }
                }}
                className={cn(
                  'rounded-ui-xs px-2 py-1 text-ui-2xs',
                  confirmReset ? 'bg-alert-soft text-alert' : 'bg-surface text-ink-faint ring-1 ring-line hover:text-brand-strong',
                )}
              >
                {confirmReset ? '再点一次确认清空' : '清空本看板'}
              </button>
            </div>
          </div>

          {/* Global prerequisite — a read-only index row, not a condition. */}
          {globalNotes.length > 0 && (
            <div data-global-note className="mt-4 rounded-ui-md border border-gold-line bg-gold-soft px-4 py-2.5">
              {globalNotes.map((note) => (
                <div key={note.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-surface px-2 py-0.5 text-ui-2xs font-semibold text-gold">周目前提</span>
                  <span className="min-w-0 flex-1 text-ui-xs text-ink">{note.name}</span>
                  <span className="text-ui-2xs text-ink-faint">{note.hint}</span>
                  {note.link && <a href={note.link.href} className="text-ui-2xs text-brand hover:underline">攻略 ›</a>}
                </div>
              ))}
            </div>
          )}

          {/* Roster: read from the tracker, never duplicated here. */}
          <div data-roster-bar className="mt-4 flex flex-wrap items-center gap-2 rounded-ui-md border border-line bg-surface px-4 py-2.5 shadow-soft">
            <span className="text-ui-xs font-semibold text-ink-muted">旗下阵容</span>
            <span className="text-ui-2xs text-ink-faint">读事件追踪器的名单，不在这里另选</span>
            <div className="flex flex-wrap gap-1.5">
              {rosterArtists.map((artist) => (
                <span key={artist.id} data-roster-artist data-artist-id={artist.id} className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-ui-2xs text-ink-muted">
                  {artist.avatar && (
                    <img src={`${import.meta.env.BASE_URL}${artist.avatar}`} alt="" className="h-4 w-4 rounded-full object-cover" />
                  )}
                  {artist.title}
                </span>
              ))}
              {!rosterArtists.length && (
                <a href="#/tracker" data-roster-empty className="text-ui-2xs text-brand hover:underline">
                  还没选艺人 · 去事件追踪器选好 4 人 ›
                </a>
              )}
            </div>
          </div>

          {/* Six vertical cards, 3 × 2. */}
          <div className="mt-5 mb-1 flex items-center gap-2">
            <h2 className="text-ui-sm font-bold text-brand-strong">通告卡片</h2>
            <span className="text-ui-2xs text-ink-faint">
              卡头勾「本次做」→ 指派艺人 → 逐条确认；标「共享」的条目改一处，多张卡同步
            </span>
          </div>
          <div data-notice-grid className="grid grid-cols-3 items-start gap-4 tab:grid-cols-2 phone:grid-cols-1">
            {notices.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                rows={evaluation.byNotice[notice.id] ?? []}
                notes={notesByNotice[notice.id] ?? []}
                artists={allArtists}
                roster={selectedArtists}
                state={state}
                hideDone={hideDone}
                onToggleEnabled={board.toggleEnabled}
                onAssign={board.assign}
                onUnassign={board.unassign}
                onSetGroupLocked={board.setGroupLocked}
                onCheck={board.toggleCheck}
                onBump={board.bump}
                onValue={board.setValue}
                onDone={board.toggleDone}
                onStat={board.setStat}
                onCourse={board.cycleCourse}
              />
            ))}
          </div>

          <p className="mt-5 text-ui-2xs text-ink-faint">
            条件来源：人工维护的六大通告条件表（{data.stats.rows} 行 = {data.stats.conditions} 条条件 + {data.stats.notes} 条只读备注），
            深链已逐条对过攻略事件号。属性 / 证书的「还差多少」是可选填写，不填也不影响勾选进度。
          </p>
        </div>
      </div>
    </div>
  );
}
