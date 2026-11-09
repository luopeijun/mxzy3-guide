import type { GuideData } from '../../types/guide';
import TrackerSetup from './TrackerSetup';
import TrackerCategories from './TrackerCategories';
import TrackerOverview from './TrackerOverview';
import TrackerCategoryProgress from './TrackerCategoryProgress';
import TrackerRecycle from './TrackerRecycle';
import TrackerPool from './TrackerPool';

interface Props {
  data: GuideData;
}

/** Overlay that replaces the reader while the tracker is open. It starts below
 *  the 64px global header, so that single header stays mounted and visible for
 *  both views — switching tabs never redraws it. The guide underneath also
 *  stays mounted, preserving its sidebar expansion and scroll position.
 *  Three columns: selector on the left, event pool in the middle, progress /
 *  archive rail on the right; they stack on narrow screens. */
export default function TrackerApp({ data }: Props) {
  return (
    <div data-tracker-app className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col bg-canvas">
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
