import type { ArtistProfile, ProfileRow } from '../types/guide';

interface Props {
  profile: ArtistProfile;
}

/** Label / value grid shared by the basics and the contract block. Long values
 *  (人物介绍、目标) wrap in place instead of stretching the column. */
function Rows({ rows }: { rows: ProfileRow[] }) {
  return (
    <dl className="grid gap-x-7 gap-y-2 [grid-template-columns:repeat(auto-fit,minmax(168px,1fr))]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start gap-2">
          <dt className="shrink-0 text-ui-2xs leading-[1.75] text-ink-faint">{row.label}</dt>
          <dd className="min-w-0 break-words text-ui-xs font-medium leading-[1.75] text-ink">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Artist basics and first-year contract, pinned at the top of the article.
 *  Fed from `sources/sweet/artist-profiles.txt`; never part of `blocks`, so the
 *  event anchors and per-step tracker progress stay stable. */
export default function ArtistProfileCard({ profile }: Props) {
  return (
    <section className="mb-6 overflow-hidden rounded-ui-md border border-line bg-surface shadow-soft">
      <div className="border-b border-line bg-brand-soft px-5 py-2.5">
        <h2 className="text-ui-sm font-bold tracking-[0.01em] text-brand-strong">
          {profile.name ? `${profile.name} · 艺人基本资料与合约条件` : '艺人基本资料与合约条件'}
        </h2>
      </div>

      <div className="px-5 pt-3.5 pb-4">
        <Rows rows={profile.rows} />
        {profile.intro && (
          <div className="mt-3.5 border-t border-dashed border-line pt-3.5">
            <h3 className="mb-1.5 text-ui-xs font-bold text-ink">{profile.intro.label}</h3>
            <p className="text-ui-xs leading-[1.85] text-ink-muted">{profile.intro.value}</p>
          </div>
        )}
      </div>

      {profile.contract && (
        <div className="border-t border-line bg-surface-soft px-5 py-3.5">
          <h3 className="mb-2 flex items-center gap-1.5 text-ui-xs font-bold text-ink">
            <span className="h-[6px] w-[6px] rounded-full bg-gold" aria-hidden="true" />
            {profile.contract.title}
          </h3>
          <Rows rows={profile.contract.rows} />
        </div>
      )}
    </section>
  );
}
