import { Fragment } from 'react';
import { cn } from '../lib/cn';
import { noticeLabel, noticeUnit, type TitleLine, type TitleMeta } from '../lib/caseParser';
import type { TitleGapItem, TitleNext } from '../lib/titleLadder';

/** 称号按「职业线」上色：唱片 / 主持 / 模特 / 影视 / 天王·天后各一色，
 *  过气、新人、未出道这类跨线状态用中性灰。 */
const TITLE_LINE_LABEL: Record<TitleLine, string> = {
  music: '唱片线', host: '主持线', model: '模特线', screen: '影视线',
  star: '总称号', other: '其他',
};

const TITLE_LINE_HINT: Record<TitleLine, string> = {
  music: '唱片养成', host: '主持养成', model: '广告养成',
  screen: '电视 / 电影养成', star: '演技 + 歌艺双线', other: '跨线状态',
};

const TITLE_LINE_TONE: Record<TitleLine, string> = {
  music: 'border-title-music-line bg-title-music-soft text-title-music',
  host: 'border-title-host-line bg-title-host-soft text-title-host',
  model: 'border-title-model-line bg-title-model-soft text-title-model',
  screen: 'border-title-screen-line bg-title-screen-soft text-title-screen',
  star: 'border-title-star-line bg-title-star-soft text-title-star',
  other: 'border-title-other-line bg-title-other-soft text-title-other',
};

const TITLE_LINE_TEXT: Record<TitleLine, string> = {
  music: 'text-title-music', host: 'text-title-host', model: 'text-title-model',
  screen: 'text-title-screen', star: 'text-title-star', other: 'text-title-other',
};

/** 门槛文案：达标的只写「名气 500」（绿色，不写「已够」），没达标的写清还差多少。 */
function needGapText(item: TitleGapItem): string {
  const unit = noticeUnit(item.label);
  const need = `${noticeLabel(item.label)} ${item.need}${unit}`;
  if (item.diff === null || item.diff === 0) return need;
  return `${need}，还差 ${item.diff}${unit}`;
}

/** 一个门槛小标签：绿 = 已达标、红 = 还差、灰 = 读不到当前值。 */
function GapChip({ item }: { item: TitleGapItem }) {
  return (
    <span
      data-case-gap={item.label}
      data-gap-state={item.diff === 0 ? 'ready' : item.diff === null ? 'unknown' : 'short'}
      className={cn(
        'rounded px-1 text-ui-2xs tabular-nums',
        item.diff === 0
          ? 'bg-title-model-soft text-title-model'
          : item.diff === null
            ? 'bg-surface-soft text-ink-muted'
            : 'bg-alert-soft text-alert',
      )}
    >
      {item.display ?? needGapText(item)}
    </span>
  );
}

/** 称号徽标：颜色标线，hover / 键盘聚焦时展开这条线的门槛。
 *  主站与甜蜜乐章共用同一套 DOM / data 属性；data-case-* 供现有回归抓取。 */
export function TitleBadge({ title, meta, next }: {
  title: string; meta: TitleMeta | null; next: TitleNext | null;
}) {
  const line: TitleLine = meta?.line ?? 'other';
  const need = meta?.need ?? [];
  return (
    <span className="group relative inline-flex" data-case-artist-title-wrap>
      <span
        data-case-artist-title
        data-title-line={line}
        tabIndex={0}
        className={cn(
          'cursor-help rounded-full border px-1.5 text-ui-2xs font-semibold outline-none',
          'focus-visible:ring-2 focus-visible:ring-brand-line',
          TITLE_LINE_TONE[line],
        )}
      >
        {title}
      </span>
      <span
        data-case-artist-title-card
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 w-[300px] pt-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      >
        {/* 外层的 pt-1 顶住徽标与卡片之间的缝：鼠标挪到卡片上不闪退，
            卡片本身也能选中 / 复制文字。 */}
        <span className="block rounded-ui-sm border border-line bg-surface p-2 text-left shadow-lg">
          <span className="flex items-baseline gap-1">
            <b className={cn('text-ui-2xs', TITLE_LINE_TEXT[line])}>{TITLE_LINE_LABEL[line]}</b>
            <span className="text-ui-2xs text-ink-faint">{TITLE_LINE_HINT[line]}</span>
            {meta?.rank !== null && meta?.rank !== undefined && (
              <span className="ml-auto text-ui-2xs text-ink-faint">第 {meta.rank + 1} 档</span>
            )}
          </span>
          {need.length > 0 ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {need.map(([label, value]) => (
                <span key={label} className="rounded bg-surface-soft px-1 text-ui-2xs text-ink-muted">
                  {noticeLabel(label)} <b className="tabular-nums">{value}{noticeUnit(label)}</b>
                </span>
              ))}
            </span>
          ) : (
            <span className="mt-1 block text-ui-2xs text-ink-faint">没有门槛：出道前的默认称号</span>
          )}
          {next ? (
            <span
              data-case-artist-title-next
              className="mt-1.5 block border-t border-line pt-1.5"
            >
              <span className="flex items-baseline gap-1">
                <span className="text-ui-2xs text-ink-faint">下一档</span>
                <b className="text-ui-2xs text-ink">{next.name}</b>
                {next.ready && (
                  <span className="text-ui-2xs font-semibold text-title-model">条件已够</span>
                )}
              </span>
              {next.shared.length > 0 && (
                <span data-case-title-shared className="mt-1 flex flex-wrap gap-1">
                  {next.shared.map((item) => <GapChip key={item.label} item={item} />)}
                </span>
              )}
              {next.branches.some((branch) => branch.items.length > 0) && (
                <span data-case-title-branches className="mt-1 block">
                  {next.branches.length > 1 && (
                    <span className="block text-ui-2xs text-ink-faint">作品条件：任一套达成即可</span>
                  )}
                  {next.branches.map((branch, i) => (
                    <span
                      key={i}
                      data-case-title-branch={i}
                      className="mt-1 flex flex-wrap items-center gap-1"
                    >
                      {/* 每支都以「或」起头，行行对齐；支内多项是「并」，用 + 连。 */}
                      {next.branches.length > 1 && (
                        <span
                          data-case-title-or
                          className="w-4 shrink-0 text-center text-ui-2xs font-semibold text-ink-muted"
                        >
                          或
                        </span>
                      )}
                      {branch.items.map((item, j) => (
                        <Fragment key={item.label}>
                          {j > 0 && (
                            <span className="text-ui-2xs font-semibold text-ink-faint">+</span>
                          )}
                          <GapChip item={item} />
                        </Fragment>
                      ))}
                    </span>
                  ))}
                </span>
              )}
              {next.extras.length > 0 && (
                <span data-case-title-extras className="mt-1 block border-t border-line pt-1">
                  <span className="mb-1 block text-ui-2xs text-ink-faint">另需（攻略条件）：</span>
                  <span className="flex flex-wrap gap-1">
                    {next.extras.map((item) => <GapChip key={item.label} item={item} />)}
                  </span>
                </span>
              )}
            </span>
          ) : meta?.rank !== null && meta?.rank !== undefined ? (
            <span
              data-case-artist-title-next
              className="mt-1.5 block border-t border-line pt-1.5 text-ui-2xs text-ink-faint"
            >
              已经是最高档。
            </span>
          ) : null}
            <span className="mt-1 block text-ui-2xs text-ink-faint">同一时间只挂一个称号。</span>
        </span>
      </span>
    </span>
  );
}
