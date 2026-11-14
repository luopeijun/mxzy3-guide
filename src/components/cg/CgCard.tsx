import { cn } from '../../lib/cn';
import SmartImage from '../../ui/SmartImage';
import type { CgItem } from '../../types/cg';

/** 卡片尺寸档位，由 CgApp 的「大/中/小」开关传入。 */
export type CgCardSize = 'sm' | 'md' | 'lg';

interface Props {
  item: CgItem;
  collected: boolean;
  /** 尺寸档位决定元素落点：
   *  - 大档（520px）：底栏一行放下 收集 + 经纪人 + 序号 + 名称 + 攻略，图片干净；
   *  - 中档（380px）：底栏放 收集 + 序号 + 名称 + 攻略，经纪人浮到图片左上角（一行放不下）；
   *  - 小档（300px）：序号+经纪人都浮到图片（左上经纪人 / 右上序号），底栏只留 收集 + 名称 + 攻略，名称单行。 */
  size?: CgCardSize;
  /** 「全部」页各人物的 CG 混在一起，用归属标签标明人物；分组页不传。 */
  group?: { name: string; avatar?: string };
  /** 有对应攻略事件时给出深链（`#/guide/<nodeId>~<anchor>`），否则不渲染入口。 */
  guideHref?: string;
  guideTitle?: string;
  /** 站点配置：甜蜜乐章的 CG 只有编号，没有名称，底栏不渲染名称那一格。 */
  showName?: boolean;
  /** 排序模式：开启后整张卡可拖拽，底栏右侧出现 ↑/↓，供调整人物内顺序。主站恒不传，行为零变化。 */
  reorder?: boolean;
  /** 上移一位（仅排序模式下有效）。 */
  onMoveUp?: () => void;
  /** 下移一位（仅排序模式下有效）。 */
  onMoveDown?: () => void;
  /** 已在最前 / 最后，禁用对应箭头。 */
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
  /** 拖拽排序：拖拽开始 / 悬停于本卡 / 落在本卡 / 拖拽结束。仅排序模式下由 CgApp 传入。
   *  onDropCard 收到被拖卡片的 id（从 dataTransfer 取，不依赖 React 状态时序）。 */
  onDragStartCard?: () => void;
  onDragOverCard?: () => void;
  onDropCard?: (draggedId: string) => void;
  onDragEndCard?: () => void;
  /** 当前卡正被拖拽 / 正作为落点高亮（仅排序模式下生效）。 */
  isDragging?: boolean;
  isDragOver?: boolean;
  onToggle: () => void;
  onOpen: (trigger: HTMLButtonElement) => void;
}

/** 一张 CG 卡：图片占主体，底部一行收集 + 名称 + 攻略（同一尺寸下所有卡片等高）。
 *  序号 / 归属标签按尺寸档位在「图片浮层」与「底栏」之间挪动，详见 Props.size 说明。
 *  图片本身是「查看大图」按钮，整块可点，图上浮层是 pointer-events-none 不误触。 */
export default function CgCard({
  item, collected, size = 'md', group, guideHref, guideTitle,
  showName = true, reorder = false, onMoveUp, onMoveDown,
  moveUpDisabled = false, moveDownDisabled = false,
  onDragStartCard, onDragOverCard, onDropCard, onDragEndCard,
  isDragging = false, isDragOver = false, onToggle, onOpen,
}: Props) {
  const isSm = size === 'sm';
  const isLg = size === 'lg';
  /** 无名称的站点只留编号，别让 aria / alt 拖着一个空尾巴。 */
  const label = [item.code, item.name].filter(Boolean).join(' ');
  const fontPx = isSm ? 'text-[12px]' : 'text-[14px]';
  const btnH = isSm ? 'h-5' : 'h-6';
  // 归属标签：大档底栏一行放得下，留在底栏；小/中档浮到图片左上角（分组视图 group 为空则都不显示）。
  const groupOnImage = !!group && !isLg;
  // 序号：仅小档浮到图片右上角；中/大档在底栏一行。
  const codeOnImage = isSm;

  const groupTagInner = group ? (
    <>
      {group.avatar ? (
        <SmartImage
          src={group.avatar}
          alt=""
          aria-hidden="true"
          className={cn('shrink-0 rounded-full border border-line-strong object-cover', isSm ? 'h-4 w-4' : 'h-5 w-5')}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-brand-soft font-semibold text-brand-strong',
            isSm ? 'h-4 w-4 text-[10px]' : 'h-5 w-5 text-ui-2xs',
          )}
        >
          {group.name.slice(0, 1)}
        </span>
      )}
      <span className={cn('truncate font-medium text-ink', isSm ? 'text-[11px]' : 'text-ui-2xs')}>{group.name}</span>
    </>
  ) : null;

  return (
    <article
      id={`cg-card-${item.id}`}
      data-cg-card
      data-cg-id={item.id}
      data-cg-collected={collected ? 'true' : 'false'}
      data-cg-draggable={reorder ? 'true' : undefined}
      data-cg-dragging={reorder && isDragging ? 'true' : undefined}
      data-cg-drag-over={reorder && isDragOver ? 'true' : undefined}
      draggable={reorder}
      onDragStart={reorder ? (event) => { onDragStartCard?.(); if (event.dataTransfer) { event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; } } : undefined}
      onDragOver={reorder ? (event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; onDragOverCard?.(); } : undefined}
      onDrop={reorder ? (event) => { event.preventDefault(); const id = event.dataTransfer?.getData('text/plain') ?? ''; onDropCard?.(id); } : undefined}
      onDragEnd={reorder ? () => onDragEndCard?.() : undefined}
      className={cn(
        'scroll-mt-[88px] overflow-hidden rounded-ui-md border bg-surface transition-all duration-200 hover:border-brand-line',
        collected ? 'border-brand-line shadow-soft' : 'border-line',
        reorder && isDragging && 'opacity-40',
        reorder && isDragOver && 'border-brand ring-2 ring-brand/60',
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-soft">
        <button
          type="button"
          data-cg-open
          aria-label={`查看大图 ${label}`}
          title="查看大图"
          onClick={(event) => onOpen(event.currentTarget)}
          className="absolute inset-0 z-0 block h-full w-full cursor-pointer"
        >
          {item.image ? (
            <SmartImage
              src={item.image}
              alt={label}
              skeleton
              className={cn(
                'h-full w-full object-cover transition-all duration-200',
                !collected && 'grayscale',
              )}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-2 text-center text-ui-2xs text-ink-faint">
              站点未提供图片
            </span>
          )}
        </button>
        {/* 图片浮层（纯展示、不挡点击）：仅小/中档的归属标签浮左上；仅小档的序号浮右上。 */}
        {groupOnImage && (
          <span
            data-cg-group-tag
            data-cg-group-name={group!.name}
            className={cn(
              'pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-white/80 py-0.5 pl-0.5 pr-2 shadow-soft backdrop-blur-sm',
              isSm ? 'gap-0.5 pr-1.5' : '',
            )}
          >
            {groupTagInner}
          </span>
        )}
        {codeOnImage && (
          <span
            data-cg-code
            className={cn(
              'pointer-events-none absolute right-2 top-2 z-10 w-fit rounded-full bg-white/80 px-1.5 py-0.5 font-semibold text-brand-strong shadow-soft backdrop-blur-sm',
              isSm ? 'text-[10px]' : 'text-[11px]',
            )}
          >
            {item.code}
          </span>
        )}
      </div>
      {/* 底栏：固定行高（中/大档 h-14、小档 h-11）保住同尺寸等高。元素按尺寸档位出现——
          大档含归属标签，中/小档归属浮到图上；序号中/大档在底栏、小档在图上。名称单行不换行。 */}
      <div className={cn('flex min-w-0 items-center gap-1.5 px-2.5', isSm ? 'h-11 gap-1' : 'h-14')}>
        <button
          type="button"
          data-cg-toggle
          aria-pressed={collected}
          aria-label={`${collected ? '取消收集' : '标记已收集'} ${label}`}
          title={collected ? '取消收集' : '标记已收集'}
          onClick={onToggle}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2 font-medium leading-none transition-colors',
            btnH,
            fontPx,
            collected
              ? 'bg-brand text-white'
              : 'border border-ink-faint text-ink-muted hover:border-brand hover:text-brand-strong',
          )}
        >
          <span aria-hidden className={cn('leading-none', fontPx)}>{collected ? '✓' : '○'}</span>
          {collected ? '已收集' : '收集'}
        </button>
        {!groupOnImage && group && (
          <span
            data-cg-group-tag
            data-cg-group-name={group.name}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface-soft py-0.5 pl-0.5 pr-2',
              isSm ? 'gap-0.5 pr-1.5' : '',
            )}
          >
            {groupTagInner}
          </span>
        )}
        {!codeOnImage && (
          <span data-cg-code className={cn('shrink-0 font-semibold text-brand-strong', fontPx)}>{item.code}</span>
        )}
        {showName && (
          <span
            data-cg-name
            className={cn('min-w-0 truncate font-medium text-ink', fontPx)}
            title={item.name}
          >{item.name}</span>
        )}
        {guideHref && (
          <a
            data-cg-guide-link
            href={guideHref}
            title={guideTitle ?? '查看对应攻略事件'}
            className={cn('ml-auto shrink-0 rounded-full px-1.5 py-0.5 leading-none text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand-strong', fontPx)}
          >
            攻略<span aria-hidden className="ml-0.5">›</span>
          </a>
        )}
        {/* 排序模式下才出现的 ↑/↓：把当前 CG 在「人物内」上移 / 下移一位，
         *  序号（CG 01/CG 02…）会实时跟着变化。主站不传 reorder，永不渲染。 */}
        {reorder && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              data-cg-move-up
              aria-label="上移一位"
              disabled={moveUpDisabled}
              onClick={(event) => { event.stopPropagation(); onMoveUp?.(); }}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border leading-none transition-colors',
                fontPx,
                moveUpDisabled
                  ? 'cursor-not-allowed border-line/50 text-ink-faint/50'
                  : 'border-brand-line text-brand-strong hover:bg-brand-soft',
              )}
            >↑</button>
            <button
              type="button"
              data-cg-move-down
              aria-label="下移一位"
              disabled={moveDownDisabled}
              onClick={(event) => { event.stopPropagation(); onMoveDown?.(); }}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border leading-none transition-colors',
                fontPx,
                moveDownDisabled
                  ? 'cursor-not-allowed border-line/50 text-ink-faint/50'
                  : 'border-brand-line text-brand-strong hover:bg-brand-soft',
              )}
            >↓</button>
          </span>
        )}
      </div>
    </article>
  );
}
