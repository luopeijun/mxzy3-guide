import { useRef } from 'react';
import type { GuideData } from '../../types/guide';
import { useWheelForward } from '../../hooks/useWheelForward';
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
  const poolRef = useRef<HTMLElement>(null);
  // Columns scroll independently; forward wheels from the side rails / header
  // into the event pool so the pointer does not have to stay in the middle.
  useWheelForward(poolRef);
  return (
    <div data-tracker-app className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col bg-canvas">
      {/* On narrow screens the flex row stacks and grows past this box, so the
          wrapper itself must scroll — otherwise overflow-hidden clips the
          stacked columns and the page cannot be scrolled at all. */}
      <div className="min-h-0 flex-1 overflow-hidden tab:[scrollbar-gutter:stable] tab:overflow-y-auto">
        <div className="mx-auto flex h-full w-full gap-6 px-6 nav:gap-4 nav:px-4 tab:h-auto tab:flex-col tab:overflow-visible">
          <aside className="w-[320px] shrink-0 overflow-y-auto py-6 pr-1 tab:w-full tab:overflow-visible tab:py-4">
            <div className="flex flex-col gap-4 pb-6">
              <TrackerSetup data={data} />
              <TrackerCategories data={data} />
            </div>
          </aside>
          {/* No top padding on the scroll container: a sticky child can only
              reach the padding edge, so any pt here would leave a transparent
              strip where scrolled cards show above the search bar. The top
              spacing lives on TrackerPool's section instead. */}
          {/* A stable scrollbar gutter keeps the middle column at a constant
              width: filtering down to one card must not make the scrollbar
              vanish and shift the whole filter-chip row sideways. */}
          <main ref={poolRef} className="min-w-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto pb-6 nav:pb-4 tab:overflow-visible tab:pb-2">
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
