import type { GuideData } from '../../types/guide';
import TrackerHeader from './TrackerHeader';
import TrackerSetup from './TrackerSetup';
import TrackerPool from './TrackerPool';

interface Props {
  data: GuideData;
  onClose: () => void;
}

/** Full-screen overlay that replaces the reader while the tracker is open.
 *  The guide underneath stays mounted, so its sidebar expansion and scroll
 *  survive a round-trip through the tracker. */
export default function TrackerApp({ data, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <TrackerHeader onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
        <div className="mx-auto max-w-[960px] px-9 pt-7 pb-[88px] nav:px-[18px] nav:pt-[22px]">
          <TrackerSetup data={data} />
          <TrackerPool data={data} />
        </div>
      </div>
    </div>
  );
}
