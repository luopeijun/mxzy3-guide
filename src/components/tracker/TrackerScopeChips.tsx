import { cn } from '../../lib/cn';
import type { GroupKey } from '../../lib/trackerGroups';
import {
  toggleArtistChoice,
  toggleGroupChoice,
  type ArtistChoice,
} from '../../lib/trackerArtistFilter';

interface Props {
  artists: ArtistChoice[];
  artistValue: string[];
  onArtistChange: (next: string[]) => void;
  groups: { key: GroupKey; label: string }[];
  groupValue: GroupKey[];
  onGroupChange: (next: GroupKey[]) => void;
}

/** One row directly under the status chips. Within a dimension the choices
 *  are a union (several artists / several groups); across dimensions they
 *  combine with the status filter — 林芬芬 + 进行中 shows only her half-done
 *  lines. 「不限」is always present so any selection can be undone in place. */
export default function TrackerScopeChips({
  artists,
  artistValue,
  onArtistChange,
  groups,
  groupValue,
  onGroupChange,
}: Props) {
  const chip = (selected: boolean) =>
    cn(
      'rounded-ui-sm border px-2 py-1 text-ui-2xs font-semibold leading-[1.5] transition-colors',
      selected
        ? 'border-brand bg-brand text-white'
        : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
    );
  const label = 'shrink-0 text-ui-2xs font-semibold text-ink-faint';

  return (
    <div
      data-scope-filter
      className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-ui-sm border border-line bg-surface-soft px-2 py-1.5"
    >
      <div data-artist-filter className="flex flex-wrap items-center gap-1.5">
        <span className={label}>艺人</span>
        <button
          type="button"
          data-artist-key="all"
          aria-pressed={artistValue.length === 0}
          onClick={() => onArtistChange([])}
          className={chip(artistValue.length === 0)}
        >
          不限
        </button>
        {artists.map((artist) => {
          const selected = artistValue.includes(artist.id);
          return (
            <button
              key={artist.id}
              type="button"
              data-artist-key={artist.id}
              aria-pressed={selected}
              onClick={() => onArtistChange(toggleArtistChoice(artistValue, artist.id))}
              className={chip(selected)}
            >
              {artist.label}
            </button>
          );
        })}
      </div>

      <div data-group-filter className="flex flex-wrap items-center gap-1.5">
        <span className={label}>分类</span>
        <button
          type="button"
          data-group-key="all"
          aria-pressed={groupValue.length === 0}
          onClick={() => onGroupChange([])}
          className={chip(groupValue.length === 0)}
        >
          不限
        </button>
        {groups.map((group) => {
          const selected = groupValue.includes(group.key);
          return (
            <button
              key={group.key}
              type="button"
              data-group-key={group.key}
              aria-pressed={selected}
              onClick={() => onGroupChange(toggleGroupChoice(groupValue, group.key))}
              className={chip(selected)}
            >
              {group.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
