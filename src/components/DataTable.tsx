import type { TableColumn, TableData } from '../types/guide';
import { cn } from '../lib/cn';

interface Props {
  data: TableData;
}

interface Best {
  value: number;
  /** Ties are left unmarked, matching the in-game table. */
  unique: boolean;
}

function bestOf(values: number[]): Best | null {
  if (!values.length || values.some((value) => Number.isNaN(value))) return null;
  const value = Math.max(...values);
  return { value, unique: values.filter((item) => item === value).length === 1 };
}

function bestValues(
  columns: TableColumn[],
  rows: TableData['rows'],
  keyOf: (column: TableColumn) => string | undefined,
): Map<string, Best> {
  const best = new Map<string, Best>();
  for (const column of columns) {
    if (!column.highlight) continue;
    const key = keyOf(column);
    if (!key) continue;
    const result = bestOf(rows.map((row) => Number(row[key])));
    if (result) best.set(column.key, result);
  }
  return best;
}

/**
 * A dense data sheet (e.g. 所有人物初始属性): one character per row, one
 * attribute per column. A column may carry a second line (`growthKey`), used
 * for the growth bonus of that attribute. The name column stays pinned while
 * the rest scrolls sideways on narrow screens, and the top value of each column
 * is picked out so comparisons don't need a mental scan of the whole grid.
 */
export default function DataTable({ data }: Props) {
  const { columns, rows } = data;
  // Columns that need the pinned-name treatment: everything after the name.
  const growthColumns = columns.filter((column) => column.growthKey);
  const best = bestValues(columns, rows, (column) => column.key);
  const bestGrowth = bestValues(growthColumns, rows, (column) => column.growthKey);

  return (
    <div className="mb-4">
      <div className="overflow-x-auto rounded-ui-md border border-line bg-surface shadow-soft">
        <table className="w-full min-w-[600px] border-collapse text-ui-sm">
          <thead>
            <tr className="bg-sidebar">
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap border-b border-line px-2 py-2.5 text-ui-xs font-semibold tracking-[0.02em] text-brand-strong',
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
                  const growth = column.growthKey ? row[column.growthKey] ?? '' : '';
                  const bestValue = best.get(column.key);
                  const bestGrowthValue = bestGrowth.get(column.key);
                  const isBest =
                    column.highlight &&
                    bestValue?.unique === true &&
                    Number(value) > 0 &&
                    Number(value) === bestValue.value;
                  const isBestGrowth =
                    growth !== '' &&
                    bestGrowthValue?.unique === true &&
                    Number(growth) === bestGrowthValue.value;

                  return (
                    <td
                      key={column.key}
                      className={cn(
                        'whitespace-nowrap px-2 py-[7px] leading-[1.5]',
                        column.numeric ? 'text-right tabular-nums' : 'text-left',
                        columnIndex === 0
                          ? 'sticky left-0 z-[1] bg-inherit font-semibold text-ink shadow-[1px_0_0_var(--color-line)]'
                          : 'text-ink-muted',
                      )}
                    >
                      <span className="block">
                        {isBest ? (
                          <span className="rounded-[4px] bg-brand-soft px-1.5 py-0.5 font-bold text-brand-strong">
                            {value}
                          </span>
                        ) : (
                          value
                        )}
                      </span>
                      {growth !== '' && (
                        <span
                          className={cn(
                            'block text-ui-2xs leading-[1.5]',
                            isBestGrowth ? 'font-semibold text-gold' : 'text-ink-faint',
                          )}
                        >
                          +{growth}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 px-1 text-ui-2xs text-ink-faint">
        {growthColumns.length > 0 && '「＋」为该属性的成长加成，写在数值下一行。'}
        {best.size > 0 && '加深的是该列最高值，多人并列时不标。'}
      </p>
    </div>
  );
}
