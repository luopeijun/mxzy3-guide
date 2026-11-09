import { COMPANY_LEGEND } from './infoStyle';
import { cn } from '../../lib/cn';

/** 公司色标图例：把 11 家公司和它们的圆点色一一列出来，扫一眼就能建立
 *  「颜色 → 公司」的对应。默认收起，点标题行的「公司色标」才展开，不占常驻高度。 */
export default function CompanyLegend() {
  return (
    <div
      data-notice-legend
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-surface-soft px-5 py-2"
    >
      <span className="text-ui-2xs font-semibold text-ink-faint">公司色标</span>
      {COMPANY_LEGEND.map((company) => (
        <span key={company.name} className="flex items-center gap-1.5">
          <span
            className={cn('h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface', company.dot)}
          />
          <span className={cn('text-ui-2xs font-semibold', company.text)}>{company.name}</span>
        </span>
      ))}
    </div>
  );
}
