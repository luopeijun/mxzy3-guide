import { useState } from 'react';
import type { SpecialNotice, SpecialRow } from '../../types/specials';
import type { RowEval, SpecialsState } from '../../lib/specialsState';
import { assignableSlots, noticeProgress, slotLimit } from '../../lib/specialsState';
import { slotLabel } from '../../lib/specials';
import { cn } from '../../lib/cn';
import ConditionRow from './ConditionRow';

export interface ArtistOption {
  id: string;
  title: string;
  avatar?: string;
}

interface Props {
  notice: SpecialNotice;
  rows: RowEval[];
  notes: SpecialRow[];
  artists: ArtistOption[];
  roster: string[];
  state: SpecialsState;
  hideDone: boolean;
  onToggleEnabled: (id: string) => void;
  onAssign: (noticeId: string, slot: string, artistId: string, limit?: number, replace?: boolean) => void;
  onUnassign: (noticeId: string, slot: string, artistId: string) => void;
  onSetGroupLocked: (noticeId: string, locked: boolean) => void;
  onCheck: (key: string) => void;
  onBump: (key: string, delta: number) => void;
  onValue: (key: string, value: number) => void;
  onDone: (rowId: string) => void;
  onStat: (artistId: string, attr: string, value: number | null) => void;
  onCourse: (artistId: string, course: string) => void;
}

const PHASES = [
  { key: 'prepare', title: '提前准备', hint: '道具、证书、公司计数等可以提前攒' },
  { key: 'trigger', title: '触发条件', hint: '让通告上门或事件发生的前提' },
  { key: 'notice', title: '通告要求', hint: '接通告时的属性门槛' },
] as const;

function titleOf(artists: ArtistOption[], id: string): string {
  return artists.find((artist) => artist.id === id)?.title ?? id;
}

/** One vertical notice card: enable → assign slots → confirm conditions →
 *  read-only timeline index. Six of these make the 3×2 board. */
export default function NoticeCard({
  notice, rows, notes, artists, roster, state, hideDone,
  onToggleEnabled, onAssign, onUnassign, onSetGroupLocked, onCheck, onBump, onValue, onDone, onStat, onCourse,
}: Props) {
  const [showNotes, setShowNotes] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const enabled = state.enabled.includes(notice.id);
  const locked = !!state.groupLocked[notice.id];
  const slots = assignableSlots(notice);
  const progress = noticeProgress(rows);
  const assigned = state.assignments[notice.id] ?? {};
  const isGroup = slots.includes('group');

  return (
    <section
      data-notice-card
      data-notice-id={notice.id}
      data-notice-enabled={enabled ? 'yes' : 'no'}
      className={cn(
        'flex min-w-0 flex-col rounded-ui-md border bg-surface shadow-soft',
        enabled ? 'border-brand-line' : 'border-line',
      )}
    >
      <header className="border-b border-line px-3.5 py-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            data-notice-enable
            data-notice-id={notice.id}
            checked={enabled}
            onChange={() => onToggleEnabled(notice.id)}
            style={{ accentColor: 'var(--color-brand)' }}
            className="h-3.5 w-3.5 shrink-0"
            aria-label={`本次做不做：${notice.title}`}
          />
          <h3 className="min-w-0 flex-1 truncate text-ui-sm font-bold text-brand-strong">
            {notice.title}
          </h3>
          <span
            data-notice-progress
            data-met={progress.met}
            data-total={progress.total}
            className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-ui-2xs tabular-nums text-ink-faint"
          >
            {progress.met} / {progress.total}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-soft">
          <div
            className="h-full rounded-full bg-growth transition-[width]"
            style={{ width: progress.total ? `${(progress.met / progress.total) * 100}%` : '0%' }}
          />
        </div>
        {enabled && (
          <div className="mt-1.5 flex items-center gap-1.5 text-ui-2xs text-ink-faint">
            <span>条件 {rows.length} 条</span>
            <span>·</span>
            <span>时间线 {notes.length} 条只看不算</span>
            {notice.guideNode && (
              <a href={`#/guide/${notice.guideNode}`} className="ml-auto text-brand hover:underline">
                攻略原文 ›
              </a>
            )}
          </div>
        )}
      </header>

      {!enabled ? (
        <p className="px-3.5 py-4 text-ui-2xs text-ink-faint">
          本次不做（未启用，不进统计）。想接这张通告时勾回上方「本次做」。
        </p>
      ) : (
        <>
          {/* Slot assignment — 昆仑 by role, 银河 as a locked group, others as
              a candidate pool that may hold more than one artist. */}
          <div className="border-b border-line bg-surface-soft/60 px-3.5 py-2.5" data-assign-block>
            <div className="flex items-center gap-2">
              <span className="text-ui-2xs font-semibold text-ink-muted">指派艺人</span>
              {isGroup && (
                <button
                  type="button"
                  data-group-lock
                  data-locked={locked ? 'yes' : 'no'}
                  disabled={!locked && (assigned.group?.length ?? 0) < 2}
                  onClick={() => onSetGroupLocked(notice.id, !locked)}
                  className={cn(
                    'ml-auto rounded-full px-2 py-0.5 text-ui-2xs disabled:opacity-50',
                    locked ? 'bg-note-soft text-note' : 'bg-brand-soft text-brand-strong hover:bg-brand-line',
                  )}
                >
                  {locked ? '已锁定 · 解散重组' : '锁定组合'}
                </button>
              )}
            </div>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {slots.map((slot) => {
                const ids = assigned[slot] ?? [];
                const options = roster.filter((id) => !ids.includes(id));
                const limit = slotLimit(notice, slot);
                const full = ids.length >= limit;
                // 天使 / 万年之恋 only take one artist: once filled the select
                // stays as a 「换人」 swap instead of disappearing.
                const solo = slot === 'main' && notice.soloMain;
                const showSelect = !locked && (!full || solo);
                return (
                  <div key={slot} data-slot={slot} className="flex flex-wrap items-center gap-1">
                    <span className="w-[52px] shrink-0 whitespace-nowrap text-ui-2xs text-ink-faint">
                      {slotLabel(slot)}
                    </span>
                    {ids.map((id) => (
                      <span
                        key={id}
                        data-assigned-artist
                        data-artist-id={id}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-ui-2xs text-brand-strong"
                      >
                        {titleOf(artists, id)}
                        {!locked && (
                          <button
                            type="button"
                            data-unassign
                            data-slot={slot}
                            data-artist-id={id}
                            onClick={() => onUnassign(notice.id, slot, id)}
                            aria-label={`移出 ${titleOf(artists, id)}`}
                            className="text-brand-strong/70 hover:text-brand-strong"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {showSelect && (
                      <select
                        data-assign-select
                        data-slot={slot}
                        value=""
                        onChange={(event) => {
                          if (event.target.value) {
                            onAssign(notice.id, slot, event.target.value, limit, full);
                          }
                        }}
                        className="rounded-full border border-line-strong bg-surface px-1.5 py-0.5 text-ui-2xs text-ink-muted"
                      >
                        <option value="">{full ? '换人' : '+ 指派艺人'}</option>
                        {options.map((id) => (
                          <option key={id} value={id}>{titleOf(artists, id)}</option>
                        ))}
                      </select>
                    )}
                    {full && !solo && (
                      <span data-slot-full className="text-ui-2xs text-ink-faint">
                        已满 {limit} 人
                      </span>
                    )}
                    {solo && (
                      <span data-solo-badge className="text-ui-2xs text-ink-faint">
                        单人通告 · 只能 1 位
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {locked && (
              <p className="mt-1.5 text-ui-2xs text-note">
                已锁定。中途换人会让加贺不再上门，确需换人请先解散重组。
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 px-3 py-3">
            {PHASES.map((phase) => {
              const all = rows.filter((item) => item.row.phase === phase.key);
              if (!all.length) return null;
              // 通告要求（属性 / 证书门槛）是重头：默认折叠，让卡片一打开就是
              // 一张干净的清单；只有想看「还差多少」时才展开填数值。
              if (phase.key === 'notice') {
                const doneCount = all.filter((item) => item.met).length;
                const visible = hideDone ? all.filter((item) => !item.met) : all;
                return (
                  <div key={phase.key} data-phase={phase.key} className="rounded-ui-sm border border-line bg-surface-soft/60">
                    <button
                      type="button"
                      data-notice-phase-toggle
                      aria-expanded={showNotice}
                      onClick={() => setShowNotice((value) => !value)}
                      className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
                    >
                      <span className="text-ui-2xs font-semibold text-ink-muted">{phase.title}</span>
                      <span className="text-ui-2xs text-ink-faint">属性 / 证书门槛 · {doneCount}/{all.length} 已确认</span>
                      <span className="ml-auto text-ui-2xs text-ink-faint">{showNotice ? '▾' : '▸ 填数值'}</span>
                    </button>
                    {showNotice && (
                      <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
                        {visible.map((item) => (
                          <ConditionRow
                            key={item.row.id}
                            item={item}
                            onCheck={onCheck}
                            onBump={onBump}
                            onValue={onValue}
                            onDone={onDone}
                            onStat={onStat}
                            onCourse={onCourse}
                          />
                        ))}
                        {hideDone && !visible.length && (
                          <span className="px-0.5 text-ui-2xs text-growth-strong">✓ 这一段全部已确认</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              const visible = hideDone ? all.filter((item) => !item.met) : all;
              const hidden = all.length - visible.length;
              return (
                <div key={phase.key} data-phase={phase.key}>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="text-ui-2xs font-semibold text-ink-muted">{phase.title}</span>
                    <span className="text-ui-2xs text-ink-faint" title={phase.hint}>
                      {visible.filter((item) => item.met).length} / {all.length} 已凑齐
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {visible.map((item) => (
                      <ConditionRow
                        key={item.row.id}
                        item={item}
                        onCheck={onCheck}
                        onBump={onBump}
                        onValue={onValue}
                        onDone={onDone}
                        onStat={onStat}
                        onCourse={onCourse}
                      />
                    ))}
                    {hidden > 0 && (
                      <span className="text-ui-2xs text-growth-strong">
                        ✓ {hidden} 条已凑齐，取消顶部「收起已完成」可查看
                      </span>
                    )}
                    {!visible.length && (
                      <span className="text-ui-2xs text-growth-strong">✓ 这一段全部凑齐</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timeline notes: zero state, zero counting, pure index. */}
          <div className="mt-auto border-t border-line px-3.5 py-2.5">
            <button
              type="button"
              data-notes-toggle
              aria-expanded={showNotes}
              onClick={() => setShowNotes((value) => !value)}
              className="flex w-full items-center gap-1.5 text-left text-ui-2xs text-ink-faint hover:text-brand-strong"
            >
              <span>{showNotes ? '▾' : '▸'}</span>
              <span>时间线 · 只读（{notes.length}）</span>
              <span className="ml-auto">时间与步骤在事件追踪器里跟</span>
            </button>
            {showNotes && (
              <div className="mt-2 flex flex-col gap-1.5" data-notes-list>
                {notes.map((note) => (
                  <div key={note.id} data-note-row data-row-id={note.id} className="rounded-ui-xs bg-surface-soft px-2 py-1.5">
                    <p className="text-ui-2xs leading-[1.6] text-ink-muted">{note.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {note.hint && note.hint !== '-' && (
                        <span className="min-w-0 flex-1 truncate text-ui-2xs text-ink-faint" title={note.hint}>
                          {note.hint}
                        </span>
                      )}
                      {note.link && (
                        <a
                          data-note-link
                          href={note.link.href}
                          className="shrink-0 text-ui-2xs text-brand hover:underline"
                        >
                          事件 ›
                        </a>
                      )}
                      {note.link?.node && (
                        <a
                          href={`#/guide/${note.link.node}`}
                          className="shrink-0 text-ui-2xs text-brand hover:underline"
                        >
                          攻略 ›
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
