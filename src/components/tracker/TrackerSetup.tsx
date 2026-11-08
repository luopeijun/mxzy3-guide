import type { GuideData } from '../../types/guide';
import { listArtists } from '../../lib/tracker';
import { MAX_ARTISTS, useTracker } from '../../hooks/useTracker';
import { cn } from '../../lib/cn';

interface Props {
  data: GuideData;
}

/** Pick up to four artists; their task lines auto-fill the pool, and the 路欧桑
 *  branches are chosen from the signed trio. Everything else is in by default
 *  and pruned below. */
export default function TrackerSetup({ data }: Props) {
  const { selectedArtists, toggleArtist } = useTracker();
  const artists = listArtists(data);
  const full = selectedArtists.length >= MAX_ARTISTS;

  return (
    <section className="mb-8 rounded-ui-md border border-line bg-surface p-5 shadow-soft">
      <h2 className="text-ui-lg font-bold text-brand-strong">选择追踪的艺人</h2>
      <p className="mt-2 text-ui-xs leading-[1.75] text-ink-muted">
        最多 4 位。所选艺人的全部任务线会自动进入事件池；路欧桑剧情会根据你签约的组合自动挑选对应分支。
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2 tab:grid-cols-2 phone:grid-cols-1">
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
                'flex items-center gap-2 rounded-ui-sm border px-3 py-2 text-left text-ui-xs transition-colors',
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
                  className="h-5 w-5 shrink-0 rounded-full"
                  aria-hidden="true"
                />
              )}
              <span className="font-medium">{artist.title}</span>
              {checked && <span className="ml-auto text-brand">✓</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-ui-2xs text-ink-faint">
        已选 {selectedArtists.length} / {MAX_ARTISTS}。六大特殊通告、经纪人事件簿、其他事件（路欧桑除外）默认全部进入事件池，可在下方逐条「移出」或「放弃」。
      </p>
    </section>
  );
}
