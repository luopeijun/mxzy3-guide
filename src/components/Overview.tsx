import type { GuideData } from '../types/guide';
import { countCharsDeep, countItems, formatCount } from '../lib/guide';
import StatusBadge from './StatusBadge';
import { ui } from '../styles/patterns';

/** 首页大卡片的文案。两个站点各写各的，版式与统计口径完全共用。 */
export interface OverviewHero {
  kicker: string;
  title: string;
  paragraphs: string[];
  /** 背景渐变；不传就是明星志愿3 的玫瑰星夜。 */
  gradientClass?: string;
}

const DEFAULT_HERO: OverviewHero = {
  kicker: 'STARDOM 3 · GUIDE BROWSER',
  title: '明星志愿3 · 攻略助手',
  paragraphs: [
    '攻略内容选自百度贴吧明星志愿吧，为修正版。此攻略版权归百度明星志愿吧所有。感谢原版攻略整理者【紫色的爱丽丝】。',
    '新攻略联合编辑者名单：',
    '万俟灵眸、Aphely、仁济天下、薰扑扑、穆璃8989、向日葵的小花瓣、胖子阿亮、子翔子、全角度爱co、我叫杯具D、ji透明阴霾、端坐·霜天之上、four_四四、solame小栖、同人女琪、ou12350、huihui0410、blestboy、人一生难得糊涂、抛弃番茄追小k、音1slandヽ',
  ],
  gradientClass: 'bg-[linear-gradient(118deg,#5e2540,#9a4664_58%,#a8506e)]',
};

interface Props {
  data: GuideData;
  onSelect: (id: string) => void;
  hero?: OverviewHero;
}

export default function Overview({ data, onSelect, hero = DEFAULT_HERO }: Props) {
  const { stats } = data.meta;
  const totalChars = data.categories.reduce((sum, category) => sum + countCharsDeep(category), 0);

  return (
    <div className={ui.content}>
      <section
        className={`relative isolate overflow-hidden rounded-ui-lg p-8 text-white shadow-card nav:px-[22px] nav:py-6 ${hero.gradientClass ?? DEFAULT_HERO.gradientClass}`}
      >
        <div aria-hidden="true" className="starfield pointer-events-none absolute inset-0 -z-10" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(75%_130%_at_92%_-10%,rgba(255,255,255,0.14),transparent_62%)]"
        />
        <div className="text-ui-2xs tracking-[0.16em] text-white/90">{hero.kicker}</div>
        <h1 className="mt-2 text-ui-2xl font-bold">{hero.title}</h1>
        <div className="mt-2.5 max-w-[620px] text-ui-sm leading-[1.9] text-white/95">
          {hero.paragraphs.map((text, index) => (
            <p
              key={index}
              className={index === 0 ? undefined : index === 1 ? 'mt-1.5 text-white/85' : 'text-white/85'}
            >
              {text}
            </p>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-[26px]">
          <div>
            <div className="text-ui-xl font-bold tabular-nums">{stats.categories}</div>
            <div className="text-ui-2xs text-white/90">攻略分级</div>
          </div>
          <div>
            <div className="text-ui-xl font-bold tabular-nums">{stats.items}</div>
            <div className="text-ui-2xs text-white/90">条目 / 子条目</div>
          </div>
          <div>
            <div className="text-ui-xl font-bold tabular-nums">{formatCount(totalChars)}</div>
            <div className="text-ui-2xs text-white/90">内容字数</div>
          </div>
          <div>
            <div className="text-ui-xl font-bold tabular-nums">{stats.readyItems}</div>
            <div className="text-ui-2xs text-white/90">已收录条目</div>
          </div>
        </div>
      </section>

      <div className={`${ui.cardGrid} mt-8 nav:mt-6`}>
        {data.categories.map((category) => (
          <button key={category.id} className={ui.card} type="button" onClick={() => onSelect(category.id)}>
            <div className={ui.cardHead}>
              <span className={ui.cardTitle}>{category.title}</span>
              <StatusBadge variant="accent">{countItems(category)} 项</StatusBadge>
            </div>
            <div className={ui.cardFoot}>{category.children.length} 个一级条目 → 点击查看</div>
          </button>
        ))}
      </div>
    </div>
  );
}
