import { useState } from 'react';
import type { SpecialsState } from '../../lib/specialsState';
import { ATTRIBUTES } from '../../lib/specials';
import { cn } from '../../lib/cn';

export interface GroupStatRow {
  key: string;
  label: string;
  target: number;
}

interface ArtistRef {
  id: string;
  title: string;
  avatar?: string;
}

interface Props {
  artists: ArtistRef[];
  state: SpecialsState;
  groupRows: GroupStatRow[];
  onStat: (artistId: string, attr: string, value: number | null) => void;
  onValue: (key: string, value: number) => void;
}

/** Centralised numeric-entry panel: one place to record every roster artist's
 *  current attributes, plus the group's 名气 / 人气. The condition rows read
 *  these values and show the remaining gap — no per-row typing needed. */
export default function StatsPanel({ artists, state, groupRows, onStat, onValue }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <section data-stats-panel className="mt-4 rounded-ui-md border border-line bg-surface shadow-soft">
      <button
        type="button"
        data-stats-toggle
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <span className="text-ui-sm font-bold text-brand-strong">数值录入</span>
        <span className="hidden min-w-0 flex-1 truncate text-ui-2xs text-ink-faint sm:inline">
          填当前属性值，条件行自动算缺口（不达标标黄）；值跨所有通告卡共享
        </span>
        <span className="ml-auto shrink-0 text-ui-2xs text-ink-faint">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          {artists.length === 0 ? (
            <p className="text-ui-xs text-ink-faint">
              先在 <a href="#/tracker" className="text-brand hover:underline">事件追踪器</a> 选好旗下艺人，这里才能录入数值。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1 text-ui-2xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left font-medium text-ink-faint whitespace-nowrap">艺人</th>
                    {ATTRIBUTES.map((attr) => (
                      <th
                        key={attr.key}
                        title={attr.hint}
                        className="px-1 py-1 text-center font-medium text-ink-muted whitespace-nowrap"
                      >
                        {attr.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {artists.map((artist) => (
                    <tr key={artist.id}>
                      <td className="sticky left-0 z-10 bg-surface px-2 py-1 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-ink-muted">
                          {artist.avatar && (
                            <img
                              src={`${import.meta.env.BASE_URL}${artist.avatar}`}
                              alt=""
                              className="h-4 w-4 rounded-full object-cover"
                            />
                          )}
                          {artist.title}
                        </span>
                      </td>
                      {ATTRIBUTES.map((attr) => {
                        const value = state.stats[artist.id]?.[attr.key];
                        const filled = value !== undefined;
                        return (
                          <td key={attr.key} className="px-0.5 py-0.5">
                            <input
                              type="number"
                              min={0}
                              max={attr.max}
                              data-stat-cell
                              data-artist={artist.id}
                              data-attr={attr.key}
                              value={value ?? ''}
                              placeholder="—"
                              onChange={(event) => {
                                const raw = event.target.value;
                                onStat(artist.id, attr.key, raw === '' ? null : Math.max(0, Number(raw)));
                              }}
                              className={cn(
                                'w-[56px] rounded-ui-xs border bg-canvas px-1.5 py-0.5 text-center tabular-nums text-ink focus:border-brand focus:outline-none',
                                filled ? 'border-line-strong' : 'border-line',
                              )}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {groupRows.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1.5 text-ui-2xs text-ink-faint">团体数值 · 名气 / 人气（银河风暴需先指派团体）</div>
              <div className="flex flex-wrap gap-3">
                {groupRows.map((row) => {
                  const value = state.values[row.key];
                  const filled = value !== undefined;
                  return (
                    <label key={row.key} className="inline-flex items-center gap-1.5 text-ui-2xs text-ink-muted">
                      <span className="whitespace-nowrap">{row.label}</span>
                      <input
                        type="number"
                        min={0}
                        data-group-input
                        data-key={row.key}
                        value={value ?? ''}
                        placeholder="—"
                        onChange={(event) => {
                          const raw = event.target.value;
                          onValue(row.key, raw === '' ? 0 : Math.max(0, Number(raw)));
                        }}
                        className={cn(
                          'w-[64px] rounded-ui-xs border bg-canvas px-1.5 py-0.5 text-center tabular-nums text-ink focus:border-brand focus:outline-none',
                          filled ? 'border-line-strong' : 'border-line',
                        )}
                      />
                      <span className="text-ink-faint">/ {row.target}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
