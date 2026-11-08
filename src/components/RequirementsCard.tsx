import type { NodeRequirements, RequirementProp } from '../types/guide';
import HighlightText from './HighlightText';

interface Props {
  requirements: NodeRequirements;
}

const MARKER = 'mt-[1px] w-[13px] shrink-0 text-right text-ui-2xs font-bold tabular-nums text-brand';

function SectionTitle({ tone, children }: { tone: 'brand' | 'gold'; children: string }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-ui-xs font-bold text-ink">
      <span
        className={`h-[6px] w-[6px] rounded-full ${tone === 'brand' ? 'bg-brand' : 'bg-gold'}`}
        aria-hidden="true"
      />
      {children}
    </h3>
  );
}

/** Numbered lines inside a prop card: the 材料 of a crafted item, or the
 *  prerequisite chain of a prop that needs several steps first. */
function NumberedLines({ lines, parts }: { lines?: string[]; parts?: RequirementProp[] }) {
  const rows = parts ?? lines ?? [];
  return (
    <ol className="mt-2 space-y-[6px]">
      {rows.map((row, index) => (
        <li
          key={typeof row === 'string' ? row : row.name}
          className="flex items-start gap-1.5"
        >
          <span className={MARKER}>{index + 1}</span>
          <HighlightText
            persistent
            className="text-ui-2xs leading-[1.75] text-ink-muted"
            text={typeof row === 'string' ? row : `**${row.name}** —— ${row.from ?? ''}`}
          />
        </li>
      ))}
    </ol>
  );
}

function PropCard({ prop }: { prop: RequirementProp }) {
  return (
    <li className="rounded-ui-sm border border-line bg-surface-soft px-3.5 py-3">
      <div className="text-ui-sm font-semibold text-ink">{prop.name}</div>
      {prop.from && (
        <HighlightText
          persistent
          className="mt-0.5 block text-ui-xs leading-[1.7] text-ink-muted"
          text={prop.from}
        />
      )}
      {prop.steps?.length ? <NumberedLines lines={prop.steps} /> : null}
      {prop.parts?.length ? <NumberedLines parts={prop.parts} /> : null}
    </li>
  );
}

/** Card pinned above a notice chapter: who the notice wants, what it eats.
 *  Artist requirements run full width (they read as a checklist), props sit in
 *  an auto-fit grid so one prop fills the row and four become a tidy 2×2. */
export default function RequirementsCard({ requirements }: Props) {
  const { stats, cast, items, note } = requirements;

  return (
    <section className="mb-6 overflow-hidden rounded-ui-md border border-brand-line bg-surface shadow-soft">
      <div className="border-b border-line bg-brand-soft px-5 py-2.5">
        <h2 className="text-ui-sm font-bold tracking-[0.01em] text-brand-strong">通告条件速览</h2>
      </div>

      <div className="px-5 pt-3.5 pb-4">
        <SectionTitle tone="brand">艺人要求</SectionTitle>

        {stats?.length ? (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
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

        <ul className="space-y-[7px]">
          {cast?.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span
                className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-brand-line"
                aria-hidden="true"
              />
              <HighlightText persistent className="text-ui-xs leading-[1.75] text-ink-muted" text={line} />
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-dashed border-line px-5 pt-3.5 pb-4">
        <SectionTitle tone="gold">所需道具</SectionTitle>
        <ul className="grid items-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(272px,1fr))]">
          {items?.map((item) => <PropCard key={item.name} prop={item} />)}
        </ul>
      </div>

      {note && (
        <p className="border-t border-dashed border-line px-5 py-2.5 text-ui-2xs leading-[1.75] text-ink-faint">
          <HighlightText persistent text={note} />
        </p>
      )}
    </section>
  );
}
