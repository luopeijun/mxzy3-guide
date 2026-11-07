import type { GuideData } from '../types/guide';
import { countCharsDeep, countItems, formatCount } from '../lib/guide';
import StatusBadge from './StatusBadge';
import { ui } from '../styles/patterns';

interface Props {
  data: GuideData;
  onSelect: (id: string) => void;
}

export default function Overview({ data, onSelect }: Props) {
  const { stats } = data.meta;
  const totalChars = data.categories.reduce((sum, category) => sum + countCharsDeep(category), 0);

  return (
    <div className={ui.content}>
      <section className="relative isolate overflow-hidden rounded-ui-lg bg-[linear-gradient(118deg,#5e2540,#9a4664_58%,#a8506e)] p-8 text-white shadow-card nav:px-[22px] nav:py-6">
        <div aria-hidden="true" className="starfield pointer-events-none absolute inset-0 -z-10" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(75%_130%_at_92%_-10%,rgba(255,255,255,0.14),transparent_62%)]"
        />
        <div className="text-ui-2xs tracking-[0.16em] text-white/90">STARDOM 3 · GUIDE BROWSER</div>
        <h1 className="mt-2 text-ui-2xl font-bold">明星志愿3 · 攻略助手</h1>
        <p className="mt-2.5 max-w-[620px] text-ui-md leading-[1.9] text-white/95">
          将原版攻略整理为四大分级，逐层展开查看。当前为纯浏览版本，条目进度追踪会在下一步加入。
        </p>
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

      <h2 className={ui.sectionTitle}>按分级浏览</h2>
      <div className={ui.cardGrid}>
        {data.categories.map((category) => (
          <button key={category.id} className={ui.card} type="button" onClick={() => onSelect(category.id)}>
            <div className={ui.cardHead}>
              <span className={ui.cardTitle}>{category.title}</span>
              <StatusBadge variant="accent">{countItems(category)} 项</StatusBadge>
            </div>
            {category.sourceTitle && (
              <div className={ui.cardSource}>原目录：{category.sourceTitle}</div>
            )}
            {category.description && <p className={ui.cardDesc}>{category.description}</p>}
            <div className={ui.cardFoot}>{category.children.length} 个一级条目 → 点击查看</div>
          </button>
        ))}
      </div>

      <div className="mt-[26px] rounded-ui-md border border-gold-line bg-gold-soft px-[18px] py-[14px] text-ui-xs leading-[1.8] text-note">
        数据来源：{data.meta.source}。目录中 {stats.missingItems} 个条目在这份文档中暂未收录，已在树与页面中标注「待补充」；
        「结局条件一览」等内容按原文档实际位置归入对应分级。
      </div>
    </div>
  );
}
