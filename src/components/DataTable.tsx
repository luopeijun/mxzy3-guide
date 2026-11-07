import type { TableColumn, TableData } from '../types/guide';
import { cn } from '../lib/cn';

interface Props {
  data: TableData;
}

/** Highest value per highlighted column, used to emphasise the best artist. */
function bestValues(columns: TableColumn[], rows: TableData['rows']): Map<string, number> {
  const best = new Map<string, number>();
  for (const column of columns) {
    if (!column.highlight) continue;
    best.set(column.key, Math.max(...rows.map((row) => Number(row[column.key]) || 0)));
  }
  return best;
}

/**
 * A dense data sheet (e.g. 所有人物初始属性): one character per row, one
 * attribute per column. The name column stays pinned while the rest scrolls
 * sideways on narrow screens, and the top value of each column is picked out so
 * comparisons don't need a mental scan of the whole grid.
 */
export default function DataTable({ data }: Props) {
  const { columns, rows } = data;
  const best = bestValues(columns, rows);
  const hasHighlight = best.size > 0;

  return (
    <div className="mb-4">
      <div className="overflow-x-auto rounded-ui-md border border-line bg-surface shadow-soft">
        <table className="w-full min-w-[640px] border-collapse text-ui-sm">
          <thead>
            <tr className="bg-sidebar">
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap border-b border-line px-3 py-2.5 text-ui-xs font-semibold tracking-[0.02em] text-brand-strong',
                    column.numeric ? 'text-right' : 'text-left',
                    index === 0 && 'sticky left-0 z-10 bg-sidebar shadow-[1px_0_0_var(--color-line)]',
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={row[columns[0].key]}
                className={cn(
                  'border-b border-line/60 transition-colors duration-150 last:border-b-0 hover:bg-brand-soft/50',
                  rowIndex % 2 === 1 ? 'bg-surface-soft' : 'bg-surface',
                )}
              >
                {columns.map((column, columnIndex) => {
                  const value = row[column.key] ?? '';
                  const isBest =
                    column.highlight && Number(value) > 0 && Number(value) === best.get(column.key);
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        'whitespace-nowrap px-3 py-[9px] leading-[1.5]',
                        column.numeric ? 'text-right tabular-nums' : 'text-left',
                        columnIndex === 0
                          ? 'sticky left-0 z-[1] bg-inherit font-semibold text-ink shadow-[1px_0_0_var(--color-line)]'
                          : 'text-ink-muted',
                      )}
                    >
                      {isBest ? (
                        <span className="rounded-[4px] bg-brand-soft px-1.5 py-0.5 font-bold text-brand-strong">
                          {value}
                        </span>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasHighlight && (
        <p className="mt-2 px-1 text-ui-2xs text-ink-faint">每列加粗的是该项数值最高的艺人。</p>
      )}
    </div>
  );
}
