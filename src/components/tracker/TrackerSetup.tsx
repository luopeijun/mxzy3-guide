import { useState } from 'react';
import type { GuideData } from '../../types/guide';
import { listArtists } from '../../lib/tracker';
import { MAX_ARTISTS, useTracker } from '../../hooks/useTracker';
import { cn } from '../../lib/cn';

interface Props {
  data: GuideData;
}

/** Compact, collapsible artist picker. Closed (default) it is a single row:
 *  selected artists' portraits + count. Click a portrait to drop that artist,
 *  or the row to expand the full checkbox grid. */
export default function TrackerSetup({ data }: Props) {
  const { selectedArtists, toggleArtist } = useTracker();
  const artists = listArtists(data);
  const full = selectedArtists.length >= MAX_ARTISTS;
  const [open, setOpen] = useState(false);
  const selected = artists.filter((artist) => selectedArtists.includes(artist.id));

  return (
    <section className="rounded-ui-md border border-line bg-surface shadow-soft">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? '收起艺人选择' : '展开艺人选择'}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className="shrink-0 text-ink-muted transition-transform duration-150"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          >
            ▸
          </span>
          <span className="shrink-0 text-ui-sm font-bold text-brand-strong">追踪艺人</span>
          <span className="min-w-0 truncate text-ui-2xs text-ink-faint">
            {selected.length === 0
              ? `点击选择 · 最多 ${MAX_ARTISTS} 位`
              : `${selected.length}/${MAX_ARTISTS} 位 · 点头像可取消`}
          </span>
        </button>

        {selected.length > 0 && (
          <div className="flex shrink-0 items-center -space-x-1.5">
            {selected.map((artist) => (
              <button
                key={artist.id}
                type="button"
                onClick={() => toggleArtist(artist.id)}
                title={`取消追踪 ${artist.title}`}
                aria-label={`取消追踪 ${artist.title}`}
                className="rounded-full ring-2 ring-surface transition-transform hover:z-10 hover:scale-110"
              >
                {artist.avatar ? (
                  <img
                    src={`${import.meta.env.BASE_URL}${artist.avatar}`}
                    alt={artist.title}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-ui-2xs font-semibold text-brand-strong">
                    {artist.title.slice(0, 1)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <p className="text-ui-2xs leading-[1.7] text-ink-muted">
            最多 {MAX_ARTISTS} 位。所选艺人的全部任务线会自动进入事件池；路欧桑剧情按你签约的组合自动挑选分支。
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {artists.map((artist) => {
              const checked = selectedArtists.includes(artist.id);
              const disabled = !checked && full;
              return (
                <button
                  key={artist.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleArtist(artist.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-ui-sm border px-2.5 py-1.5 text-left text-ui-xs transition-colors',
                    checked
                      ? 'border-brand bg-brand-soft text-brand-strong'
                      : 'border-line bg-surface-soft text-ink-muted hover:border-brand-line',
                    disabled && 'cursor-not-allowed opacity-40 hover:border-line',
                  )}
                >
                  {artist.avatar && (
                    <img
                      src={`${import.meta.env.BASE_URL}${artist.avatar}`}
                      alt=""
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 rounded-full object-cover"
                    />
                  )}
                  <span className="min-w-0 truncate font-medium">{artist.title}</span>
                  {checked && <span className="ml-auto shrink-0 text-brand">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
