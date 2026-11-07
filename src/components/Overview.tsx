import type { GuideData } from '../types/guide';
import { countItems } from '../lib/guide';
import StatusBadge from './StatusBadge';
import { ui } from '../styles/patterns';

interface Props {
  data: GuideData;
  onSelect: (id: string) => void;
}

export default function Overview({ data, onSelect }: Props) {
  const { stats } = data.meta;

  return (
    <div className={ui.content}>
      <section className="rounded-ui-lg bg-[linear-gradient(120deg,#6d365f,#8e4a7e_58%,#a76879)] p-8 text-white shadow-card nav:px-[22px] nav:py-6">
        <div className="text-ui-2xs tracking-[0.16em] opacity-[0.78]">STARDOM 3 · GUIDE BROWSER</div>
        <h1 className="mt-2 text-ui-2xl font-bold">明星志愿3 · 攻略助手</h1>
        <p className="mt-2.5 max-w-[620px] text-ui-md leading-[1.9] opacity-90">
          将原版攻略整理为四大分级，逐层展开查看。当前为纯浏览版本，条目进度追踪会在下一步加入。
        </p>
        <div className="mt-6 flex flex-wrap gap-[26px]">
          <div>
            <div className="text-ui-xl font-bold tabular-nums">{stats.categories}</div>
            <div className="text-ui-2xs opacity-[0.78]">攻略分级</div>
          </div>
          <div>
            <div className="text-ui-xl font-bold tabular-nums">{stats.items}</div>
            <div className="text-ui-2xs opacity-[0.78]">条目 / 子条目</div>
          </div>
          <div>
            <div className="text-ui-xl font-bold tabular-nums">{stats.blocks}</div>
            <div className="text-ui-2xs opacity-[0.78]">正文段落</div>
          </div>
          <div>
            <div className="text-ui-xl font-bold tabular-nums">{stats.sourceParagraphs}</div>
            <div className="text-ui-2xs opacity-[0.78]">原文段落</div>
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
