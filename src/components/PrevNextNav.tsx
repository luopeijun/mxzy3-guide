import type { GuideNode } from '../types/guide';
import { cn } from '../lib/cn';

interface Props {
  prev: GuideNode | null;
  next: GuideNode | null;
  onSelect: (id: string) => void;
}

const NAV_CARD =
  'rounded-ui-md border border-line bg-surface px-4 py-3 text-left transition-[border-color,box-shadow] duration-150 hover:border-brand-line hover:shadow-soft';

export default function PrevNextNav({ prev, next, onSelect }: Props) {
  return (
    <nav className="mt-10 grid grid-cols-2 gap-3 border-t border-line pt-[22px] phone:grid-cols-1" aria-label="相邻条目">
      {prev ? (
        <button className={NAV_CARD} type="button" onClick={() => onSelect(prev.id)}>
          <div className="text-ui-2xs text-ink-faint">← 上一条</div>
          <div className="mt-[3px] truncate text-ui-sm font-semibold text-brand">{prev.title}</div>
        </button>
      ) : (
        <div className={cn(NAV_CARD, 'invisible')} />
      )}
      {next ? (
        <button
          className={cn(NAV_CARD, 'col-start-2 text-right phone:col-start-1')}
          type="button"
          onClick={() => onSelect(next.id)}
        >
          <div className="text-ui-2xs text-ink-faint">下一条 →</div>
          <div className="mt-[3px] truncate text-ui-sm font-semibold text-brand">{next.title}</div>
        </button>
      ) : (
        <div className={cn(NAV_CARD, 'invisible col-start-2 text-right phone:col-start-1')} />
      )}
    </nav>
  );
}
