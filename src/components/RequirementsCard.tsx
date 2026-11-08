import type { NodeRequirements, RequirementProp } from '../types/guide';

interface Props {
  requirements: NodeRequirements;
}

/** `①名称 — 获得途径` line; crafted props list their materials underneath. */
function PropLine({
  prop,
  index,
  nested = false,
}: {
  prop: RequirementProp;
  index: number;
  nested?: boolean;
}) {
  return (
    <li>
      {nested ? (
        <div className="flex items-start gap-1.5">
          <span className="mt-[1px] w-[13px] shrink-0 text-right text-ui-2xs font-bold tabular-nums text-brand">
            {index + 1}
          </span>
          <p className="text-ui-2xs leading-[1.75] text-ink-muted">
            <span className="font-semibold text-ink">{prop.name}</span>
            <span className="px-1 text-ink-faint">—</span>
            {prop.from}
          </p>
        </div>
      ) : (
        <>
          <div className="text-ui-sm font-semibold text-ink">{prop.name}</div>
          <p className="mt-0.5 text-ui-xs leading-[1.7] text-ink-muted">{prop.from}</p>
        </>
      )}
      {prop.parts?.length ? (
        <ul className="mt-2 space-y-[6px] border-l border-dashed border-brand-line pl-3">
          {prop.parts.map((part, i) => (
            <PropLine key={part.name} prop={part} index={i} nested />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Card pinned above a notice chapter: who the notice wants, what it eats. */
export default function RequirementsCard({ requirements }: Props) {
  const { stats, cast, items, note } = requirements;

  return (
    <section className="mb-6 overflow-hidden rounded-ui-md border border-brand-line bg-surface shadow-soft">
      <div className="border-b border-line bg-brand-soft px-5 py-2.5">
        <h2 className="text-ui-sm font-bold tracking-[0.01em] text-brand-strong">
          通告条件速览
        </h2>
      </div>

      <div className="grid grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-x-6 gap-y-5 px-5 py-4 nav:grid-cols-1">
        <div>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-ui-xs font-bold text-ink">
            <span className="h-[6px] w-[6px] rounded-full bg-brand" aria-hidden="true" />
            艺人要求
          </h3>

          {stats?.length ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {stats.map((stat) => (
                <span
                  key={stat.label}
                  className="inline-flex items-baseline gap-1 rounded-full border border-brand-line bg-brand-soft px-2.5 py-[3px] text-ui-2xs text-brand-strong"
                >
                  {stat.label}
                  <b className="text-ui-xs font-bold tabular-nums">{stat.value}</b>
                </span>
              ))}
            </div>
          ) : null}

          <ul className="space-y-2">
            {cast?.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span
                  className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-brand-line"
                  aria-hidden="true"
                />
                <span className="text-ui-xs leading-[1.75] text-ink-muted">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-ui-xs font-bold text-ink">
            <span className="h-[6px] w-[6px] rounded-full bg-gold" aria-hidden="true" />
            所需道具
          </h3>
          <ul className="space-y-3">
            {items?.map((item, i) => <PropLine key={item.name} prop={item} index={i} />)}
          </ul>
        </div>
      </div>

      {note && (
        <p className="border-t border-dashed border-line px-5 py-2.5 text-ui-2xs leading-[1.75] text-ink-faint">
          {note}
        </p>
      )}
    </section>
  );
}
