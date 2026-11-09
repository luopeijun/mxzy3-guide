import type { GuideData } from '../../types/guide';
import TrackerHeader from './TrackerHeader';
import TrackerSetup from './TrackerSetup';
import TrackerCategories from './TrackerCategories';
import TrackerOverview from './TrackerOverview';
import TrackerCategoryProgress from './TrackerCategoryProgress';
import TrackerRecycle from './TrackerRecycle';
import TrackerPool from './TrackerPool';

interface Props {
  data: GuideData;
  onClose: () => void;
}

/** Full-screen overlay that replaces the reader while the tracker is open.
 *  The guide underneath stays mounted, so its sidebar expansion and scroll
 *  survive a round-trip through the tracker.
 *  Layout fills the viewport with three columns: the selector (artists +
 *  category batch controls) on the left, the event pool in the middle, and a
 *  progress / archive rail on the right. On narrow screens the columns stack. */
export default function TrackerApp({ data, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <TrackerHeader onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full gap-6 px-6 nav:gap-4 nav:px-4 tab:h-auto tab:flex-col tab:overflow-y-auto">
          <aside className="w-[320px] shrink-0 overflow-y-auto py-6 pr-1 tab:w-full tab:overflow-visible tab:py-4">
            <div className="flex flex-col gap-4 pb-6">
              <TrackerSetup data={data} />
              <TrackerCategories data={data} />
            </div>
          </aside>
          <main className="min-w-0 flex-1 overflow-y-auto py-6 nav:py-4 tab:py-2">
            <TrackerPool data={data} />
          </main>
          <aside className="w-[320px] shrink-0 overflow-y-auto py-6 pl-1 tab:w-full tab:overflow-visible tab:py-4">
            <div className="flex flex-col gap-4 pb-6">
              <TrackerOverview data={data} />
              <TrackerCategoryProgress data={data} />
              <TrackerRecycle data={data} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
