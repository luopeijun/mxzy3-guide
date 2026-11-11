import { useState } from 'react';
import type { GuideData } from '../../types/guide';
import { listArtists } from '../../lib/tracker';
import { MAX_ARTISTS, useTracker } from '../../hooks/useTracker';
import { cn } from '../../lib/cn';

interface Props {
  data: GuideData;
}

/** Compact, collapsible artist picker. Closed (default) it is a single row:
 *  tracked artists' portraits + counts. Click a portrait to drop that artist,
 *  or the row to expand the full button grid.
 *
 *  The picker tracks a whole playthrough, not just the current roster: 旗下 is
 *  capped at 4, but releasing someone keeps their lines (and progress) in the
 *  pool. The corner badge on each button toggles 旗下 ⇄ 已解约. */
export default function TrackerSetup({ data }: Props) {
  const {
    artists: tracked,
    selectedArtists,
    releasedArtists,
    toggleArtist,
    setArtistStatus,
  } = useTracker();
  const artists = listArtists(data);
  const rosterCount = selectedArtists.length;
  const releasedCount = releasedArtists.length;
  const rosterFull = rosterCount >= MAX_ARTISTS;
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const stateOf = new Map(tracked.map((entry) => [entry.id, entry.status]));

  const addOrDrop = (id: string, title: string) => {
    const wasTracked = stateOf.has(id);
    // A newcomer joining a full roster is recorded as released: the game lets
    // you sign a 5th person only after releasing someone, and we still want to
    // follow their events. No modal, just a one-line explanation.
    if (!wasTracked && rosterFull) {
      setNotice(
        `旗下已满 ${MAX_ARTISTS} 人，${title} 已加入追踪（记为已解约），进度线照常显示`,
      );
    } else {
      setNotice('');
    }
    toggleArtist(id);
  };

  return (
    <section className="rounded-ui-md border border-line bg-surface shadow-soft">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? '收起艺人选择' : '展开艺人选择'}
          title={
            open
              ? '收起艺人列表'
              : tracked.length > 0
                ? '展开艺人列表；点右侧头像可直接移出追踪'
                : '展开选择要追踪的艺人'
          }
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className="shrink-0 text-ink-muted transition-transform duration-150"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          >
            ▸
          </span>
          <span className="shrink-0 text-ui-sm font-bold text-brand-strong">追踪艺人</span>
          {/* 折叠行空间有限：只放短计数，不 truncate。长提示放到展开区完整表述。 */}
          <span data-setup-hint className="shrink-0 whitespace-nowrap text-ui-2xs text-ink-faint">
            {tracked.length === 0
              ? `点击选择 · 最多 ${MAX_ARTISTS} 位`
              : `${rosterCount}/${MAX_ARTISTS} 位${releasedCount > 0 ? ` +${releasedCount}` : ''}`}
          </span>
        </button>

        {tracked.length > 0 && (
          <div className="flex shrink-0 items-center -space-x-1.5">
            {tracked.map((entry) => {
              const artist = artists.find((a) => a.id === entry.id);
              const title = artist?.title ?? entry.id;
              const released = entry.status === 'released';
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => toggleArtist(entry.id)}
                  title={`移出追踪 ${title}${released ? '（已解约）' : ''}`}
                  aria-label={`取消追踪 ${title}`}
                  className={cn(
                    'rounded-full ring-2 ring-surface transition-transform hover:z-10 hover:scale-110',
                    released && 'opacity-55 grayscale',
                  )}
                >
                  {artist?.avatar ? (
                    <img
                      src={`${import.meta.env.BASE_URL}${artist.avatar}`}
                      alt={title}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-ui-2xs font-semibold text-brand-strong">
                      {title.slice(0, 1)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-line px-4 pb-4 pt-3">
          <p className="text-ui-2xs leading-[1.7] text-ink-muted">
            旗下最多 {MAX_ARTISTS} 位；解约的艺人仍会留在追踪名单里，任务线与已勾选的进度都保留。路欧桑剧情只按当前旗下组合挑选分支。点按钮＝加入 / 移出追踪，点右上角角标＝解约 / 复签。
          </p>
          {notice && (
            <p
              data-setup-notice
              role="status"
              className="mt-2 rounded-ui-sm border border-brand-line bg-brand-soft px-2.5 py-1.5 text-ui-2xs leading-[1.7] text-brand-strong"
            >
              {notice}
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {artists.map((artist) => {
              const state = stateOf.get(artist.id);
              const active = state === 'active';
              const released = state === 'released';
              const trackedHere = Boolean(state);
              // Re-signing is only possible with a free roster slot.
              const resignDisabled = released && rosterFull;
              return (
                <div key={artist.id} className="group relative">
                  <button
                    type="button"
                    data-artist-button
                    data-artist-id={artist.id}
                    data-artist-state={state ?? 'none'}
                    onClick={() => addOrDrop(artist.id, artist.title)}
                    title={
                      active
                        ? `移出追踪 ${artist.title}`
                        : released
                          ? `${artist.title} 已解约 · 点击移出追踪`
                          : rosterFull
                            ? `旗下已满，${artist.title} 会记为已解约并继续追踪`
                            : `追踪 ${artist.title}`
                    }
                    className={cn(
                      'flex w-full items-center gap-2 rounded-ui-sm border px-2.5 py-1.5 text-left text-ui-xs transition-colors',
                      active
                        ? 'border-brand bg-brand-soft text-brand-strong'
                        : released
                          ? 'border-line-strong bg-surface-soft text-ink-faint'
                          : 'border-line bg-surface-soft text-ink-muted hover:border-brand-line',
                    )}
                  >
                    {artist.avatar && (
                      <img
                        src={`${import.meta.env.BASE_URL}${artist.avatar}`}
                        alt=""
                        aria-hidden="true"
                        className={cn(
                          'h-5 w-5 shrink-0 rounded-full object-cover',
                          released && 'opacity-60 grayscale',
                        )}
                      />
                    )}
                    <span className="min-w-0 truncate font-medium">{artist.title}</span>
                    <span className="ml-auto shrink-0">
                      {active ? '✓' : released ? '已解约' : ''}
                    </span>
                  </button>

                  {/* Corner badge: always present and clickable (touch has no
                      hover), expanding into a label on hover. The hover zone is
                      the whole button block via `group`, so moving the pointer
                      from the button to the badge never makes it flicker. */}
                  {trackedHere && (
                    <button
                      type="button"
                      data-artist-status-toggle
                      data-artist-id={artist.id}
                      data-artist-action={active ? 'release' : 'resign'}
                      disabled={resignDisabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        setNotice('');
                        setArtistStatus(artist.id, active ? 'released' : 'active');
                      }}
                      aria-label={`${active ? '解约' : '复签'} ${artist.title}`}
                      title={
                        active
                          ? `解约 ${artist.title}：进度线保留，路欧桑组合随即更新`
                          : resignDisabled
                            ? `旗下已满 ${MAX_ARTISTS} 人，先解约一位才能复签`
                            : `复签 ${artist.title}`
                      }
                      className={cn(
                        'absolute -right-1.5 -top-2 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border px-1 text-[11px] leading-none shadow-soft transition-all',
                        'group-hover:min-w-[38px] group-hover:rounded-ui-xs group-hover:px-1.5',
                        resignDisabled
                          ? 'cursor-not-allowed border-line bg-surface text-ink-faint opacity-60'
                          : active
                            ? 'border-line-strong bg-surface text-ink-muted hover:border-missing hover:bg-missing-soft hover:text-missing'
                            : 'border-brand-line bg-brand-soft text-brand-strong hover:border-brand',
                      )}
                    >
                      <span className="group-hover:hidden">{active ? '−' : '+'}</span>
                      <span className="hidden whitespace-nowrap group-hover:inline">
                        {active ? '解约' : resignDisabled ? '满' : '复签'}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
