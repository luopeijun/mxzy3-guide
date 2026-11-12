import TabBar, { type TabItem } from '../ui/TabBar';

export type ViewMode = 'guide' | 'tracker' | 'notices' | 'cg' | 'specials';

interface Props {
  mode: ViewMode;
  onViewGuide: () => void;
  onViewTracker: () => void;
  onViewNotices: () => void;
  onViewCg: () => void;
  onViewSpecials: () => void;
}

const TABS: TabItem[] = [
  { id: 'guide', label: '攻略' },
  { id: 'notices', label: '通告', dataTab: 'notices' },
  { id: 'tracker', label: '事件追踪' },
  { id: 'cg', label: 'CG 图鉴', dataTab: 'cg' },
  { id: 'specials', label: '六大通告', dataTab: 'specials' },
];

/** 明星志愿3 的五个顶层视图入口。页签视觉在 `ui/TabBar` 里，两站共用，
 *  这里只负责把 id 映射回各自的回调。 */
export default function ViewTabs({
  mode,
  onViewGuide,
  onViewTracker,
  onViewNotices,
  onViewCg,
  onViewSpecials,
}: Props) {
  const handlers: Record<ViewMode, () => void> = {
    guide: onViewGuide,
    notices: onViewNotices,
    tracker: onViewTracker,
    cg: onViewCg,
    specials: onViewSpecials,
  };

  return (
    <TabBar
      items={TABS}
      activeId={mode}
      ariaLabel="视图切换"
      onSelect={(id) => handlers[id as ViewMode]()}
    />
  );
}
