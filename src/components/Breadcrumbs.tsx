import type { GuideNode } from '../types/guide';
import { cn } from '../lib/cn';

interface Props {
  path: GuideNode[];
  onSelect: (id: string) => void;
}

export default function Breadcrumbs({ path, onSelect }: Props) {
  return (
    <nav className="mb-[18px] flex flex-wrap items-center gap-1.5 text-ui-2xs text-ink-faint" aria-label="当前位置">
      <button className="transition-colors duration-150 hover:text-brand hover:underline" type="button" onClick={() => onSelect('')}>
        攻略总览
      </button>
      {path.map((node, index) => (
        <span key={node.id}>
          <span className="text-line-strong">›</span>
          <button
            className={cn(
              'transition-colors duration-150 hover:text-brand hover:underline',
              index === path.length - 1 && 'text-ink-muted',
            )}
            type="button"
            onClick={() => onSelect(node.id)}
          >
            {node.title}
          </button>
        </span>
      ))}
    </nav>
  );
}
