import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { readCg, writeCg, CG_CHANGED_EVENT } from '../../lib/cg';
import { buildCgGuideLinks, cgGuideHref, cgGuideTitle } from '../../lib/cgLinks';
import type { CgGuideLink } from '../../lib/cgLinks';
import { cgGroupId, cgItemId, rememberCgGroup, writeCgGroupHash } from '../../hooks/useHashSelection';
import { useGuideContext } from '../../hooks/useGuideContext';
import type { CgData, CgItem } from '../../types/cg';
import CgCard from './CgCard';
import CgLightbox from './CgLightbox';
import SaveArchivePanel from '../tracker/SaveArchivePanel';

const PAGE_SIZE = 60;
/** 撤销条停留时长：1.5s 内没点就自己收起，免得一直悬在底部挡住最后一行卡片。 */
const UNDO_TOAST_MS = 1500;
const FLASH_CLASS = 'anchor-flash';

/** 深链落地时把目标卡片滚到视野中央并闪一下，跟攻略里的锚点跳同一套观感。 */
function flashCard(id: string) {
  let tries = 0;
  let frame = 0;
  const tick = () => {
    const el = document.getElementById(`cg-card-${id}`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.classList.remove(FLASH_CLASS);
      void el.offsetWidth;
      el.classList.add(FLASH_CLASS);
      window.setTimeout(() => el.classList.remove(FLASH_CLASS), 1800);
      return;
    }
    if (tries++ < 60) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

interface Props {
  data: CgData;
}

interface LightboxState {
  /** 打开那一刻的可见列表快照：翻页不因勾选 / 筛选变化而跳位。 */
  ids: string[];
  activeId: string;
}

/** 与攻略侧栏同一套圆形小头像；「全部」是汇总项、没有对应人物，
 *  用 2×2 汇总图标占位（比硬取「全」字更像图标，尺寸与真实头像一致、左边缘对齐）。 */
function GroupAvatar(
  { avatar, name, aggregate }: { avatar?: string; name: string; aggregate?: boolean },
) {
  if (avatar) {
    return (
      <img
        data-cg-group-avatar
        src={`${import.meta.env.BASE_URL}${avatar}`}
        alt=""
        aria-hidden="true"
        className="h-6 w-6 shrink-0 rounded-full border border-line-strong object-cover"
      />
    );
  }
  if (aggregate) {
    return (
      <span
        data-cg-group-avatar
        data-avatar-aggregate
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand-line bg-brand-soft text-brand-strong"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
          <rect x="0.5" y="0.5" width="6.2" height="6.2" rx="1.7" />
          <rect x="9.3" y="0.5" width="6.2" height="6.2" rx="1.7" />
          <rect x="0.5" y="9.3" width="6.2" height="6.2" rx="1.7" />
          <rect x="9.3" y="9.3" width="6.2" height="6.2" rx="1.7" />
        </svg>
      </span>
    );
  }
  return (
    <span
      data-cg-group-avatar
      data-avatar-fallback
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-brand-soft text-ui-2xs font-semibold text-brand-strong"
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** CG 图鉴：左侧按人物分组（经纪人 + 18 位艺人），右侧一面缩略图墙。
 *
 *  分组是原表天然切好的 19 组，每组 6–13 张，比 204 张一次铺完更好查漏；
 *  「全部」才需要分页。点图片看大图、点右上角圆勾改收集状态，两条路径互不干扰。 */
export default function CgApp({ data }: Props) {
  const validIds = useMemo(() => new Set(data.items.map((item) => item.id)), [data.items]);
  const [collected, setCollected] = useState<Set<string>>(() => readCg(validIds));
  /** 分组记在 URL 里（`#/cg/group/<id>`），刷新、复制链接回来还是同一个人物。 */
  const [groupId, setGroupId] = useState(() => cgGroupId() || 'all');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  /** 清空前的快照：误点一次不用先导出也能退回来，仅存活在本次页面会话里。 */
  const [clearedSnapshot, setClearedSnapshot] = useState<Set<string> | null>(null);
  /** 攻略里点 CG 徽标进来的 `#/cg/<id>`：切到对应分组、滚到那张卡并闪一下。 */
  const [focusId, setFocusId] = useState(() => cgItemId());
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // 攻略 → CG 的落点索引（事件块的 cgIds 是数据来源，这里只是反查表）。
  const guideData = useGuideContext();
  const guideLinks = useMemo(
    () => (guideData ? buildCgGuideLinks(guideData) : new Map<string, CgGuideLink>()),
    [guideData],
  );

  /**
   * 先认事件级映射（`cgIds` 反查），再退到页面级落点（`cg.json` 的 `guide`）。
   * 路欧桑那批感情 CG 属于后者：同一段剧情写了五个分支，锚哪一条都不对，整页落点；
   * 美丽之星写真集也走后者，但落点唯一（同一个事件），所以带上 `anchor`。
   */
  const linkFor = useCallback(
    (item: CgItem): CgGuideLink | undefined => {
      const eventLink = guideLinks.get(item.id);
      if (eventLink) return eventLink;
      return item.guide
        ? { nodeId: item.guide.nodeId, nodeTitle: item.guide.title, anchor: item.guide.anchor }
        : undefined;
    },
    [guideLinks],
  );

  // A save import writes the CG collection straight to localStorage and fires
  // this event, so re-read instead of requiring a reload.
  useEffect(() => {
    const onChanged = () => setCollected(readCg(validIds));
    window.addEventListener(CG_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CG_CHANGED_EVENT, onChanged);
  }, [validIds]);

  useEffect(() => {
    if (!archiveOpen && !clearOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setArchiveOpen(false);
      setClearOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [archiveOpen, clearOpen]);

  const toggle = (id: string) => {
    setCollected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCg(next);
      return next;
    });
  };

  /** 只清空 CG 收集：`guide.progress.v1`（事件追踪）与 `guide.memo.v1`（备忘录）
   *  都各自独立存储，这里不碰，重置追踪进度也不会反过来清掉 CG。 */
  const clearAll = () => {
    const previous = collected;
    const empty = new Set<string>();
    writeCg(empty);
    setCollected(empty);
    setClearedSnapshot(previous.size > 0 ? previous : null);
    setClearOpen(false);
  };

  const undoClear = () => {
    if (!clearedSnapshot) return;
    writeCg(clearedSnapshot);
    setCollected(clearedSnapshot);
    setClearedSnapshot(null);
  };

  // 撤销条到点自动收起；点撤销 / 关闭都会把 snapshot 置空，从而清掉定时器。
  useEffect(() => {
    if (!clearedSnapshot) return;
    const timer = window.setTimeout(() => setClearedSnapshot(null), UNDO_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [clearedSnapshot]);

  const openLightbox = (id: string, ids: string[], trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setLightbox({ ids, activeId: id });
  };

  const closeLightbox = () => {
    setLightbox(null);
    const trigger = triggerRef.current;
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  };

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [groupId, onlyMissing]);

  // 深链落点：切到这张 CG 所在分组、关掉「只看未收集」，再滚到卡片并闪一下。
  useEffect(() => {
    if (!focusId) return;
    const item = data.items.find((entry) => entry.id === focusId);
    if (!item) return;
    setGroupId(item.groupId);
    setOnlyMissing(false);
    return flashCard(item.id);
  }, [focusId, data.items]);

  // 从攻略点另一张 CG 回来时组件不会重新挂载，靠 hashchange 更新落点；
  // 手改 / 粘贴 `#/cg/group/<id>` 也走这条同步，不必刷新。
  useEffect(() => {
    const onChange = () => {
      const id = cgItemId();
      const group = cgGroupId();
      setFocusId(id);
      if (group) {
        setGroupId(group);
        setOnlyMissing(false);
        return;
      }
      if (!id) {
        setGroupId('all');
        return;
      }
      const item = data.items.find((entry) => entry.id === id);
      if (item) {
        setGroupId(item.groupId);
        setOnlyMissing(false);
      }
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [data.items]);

  // 记住这次看的分组：切去攻略再点「CG 图鉴」回来，还是这一个人物。
  useEffect(() => {
    rememberCgGroup(groupId);
  }, [groupId]);

  // 分组 id 认不出来（手改坏 / 旧链接）就退回「全部」，别让侧栏一个都不高亮。
  useEffect(() => {
    if (groupId === 'all' || data.groups.some((group) => group.id === groupId)) return;
    setGroupId('all');
    writeCgGroupHash('all');
  }, [groupId, data.groups]);

  const groupById = useMemo(
    () => new Map(data.groups.map((group) => [group.id, group])),
    [data.groups],
  );

  const groupCounts = useMemo(() => {
    const counts = new Map<string, { total: number; done: number }>();
    for (const item of data.items) {
      const entry = counts.get(item.groupId) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (collected.has(item.id)) entry.done += 1;
      counts.set(item.groupId, entry);
    }
    return counts;
  }, [data.items, collected]);

  const groupItems = useMemo(
    () => (groupId === 'all'
      ? data.items
      : data.items.filter((item) => item.groupId === groupId)),
    [data.items, groupId],
  );
  const groupDone = useMemo(
    () => groupItems.reduce((sum, item) => sum + (collected.has(item.id) ? 1 : 0), 0),
    [groupItems, collected],
  );
  const filtered = useMemo(
    () => (onlyMissing
      ? groupItems.filter((item) => !collected.has(item.id))
      : groupItems),
    [groupItems, onlyMissing, collected],
  );
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const visibleIds = useMemo(() => visible.map((item) => item.id), [visible]);

  const activeName = groupId === 'all'
    ? '全部'
    : (data.groups.find((group) => group.id === groupId)?.name ?? '全部');
  const percent = data.items.length
    ? Math.round((collected.size / data.items.length) * 100)
    : 0;

  /** 切分组：状态与 URL 一起改，刷新后仍停在这一组。 */
  const selectGroup = (id: string) => {
    setGroupId(id);
    writeCgGroupHash(id);
  };

  const groupButton = (
    id: string, name: string, total: number, done: number,
    avatar?: string, aggregate?: boolean,
  ) => {
    const active = groupId === id;
    return (
      <button
        key={id}
        type="button"
        data-cg-group
        data-cg-group-id={id}
        aria-pressed={active}
        onClick={() => selectGroup(id)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-ui-sm px-2.5 py-1.5 text-ui-xs transition-colors',
          'tab:w-auto tab:shrink-0 tab:whitespace-nowrap',
          active
            ? 'bg-brand-soft font-semibold text-brand-strong'
            : 'text-ink-muted hover:bg-surface-soft hover:text-ink',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <GroupAvatar avatar={avatar} name={name} aggregate={aggregate} />
          <span className="truncate">{name}</span>
        </span>
        <span className="shrink-0 text-ui-2xs tabular-nums text-ink-faint">{done}/{total}</span>
      </button>
    );
  };

  const lightboxItem = lightbox
    ? data.items.find((item) => item.id === lightbox.activeId)
    : null;
  const lightboxIndex = lightbox ? lightbox.ids.indexOf(lightbox.activeId) : -1;
  const stepLightbox = (delta: number) => {
    setLightbox((current) => {
      if (!current) return null;
      const index = current.ids.indexOf(current.activeId);
      const nextId = current.ids[index + delta];
      return nextId ? { ...current, activeId: nextId } : current;
    });
  };

  return (
    <div
      data-cg-app
      className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col bg-canvas px-6 pb-4 pt-3 tab:px-4 tab:pt-2"
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-ui-lg font-bold text-brand-strong">CG 图鉴</h1>
        <span className="text-ui-2xs text-ink-faint">
          共 {data.meta.itemCount} 张 · {data.meta.groupCount} 个分组
          {data.meta.missingImageCount > 0 && ` · ${data.meta.missingImageCount} 张站点未提供图片`}
        </span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1.5 text-ui-2xs tabular-nums text-ink-faint">
          <span data-cg-progress className="shrink-0 whitespace-nowrap">
            已收集 {collected.size} / {data.items.length}
          </span>
          <span className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-line phone:hidden">
            <span
              className="block h-full rounded-full bg-brand transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </span>
          <button
            type="button"
            data-cg-archive
            onClick={() => setArchiveOpen(true)}
            className="shrink-0 whitespace-nowrap rounded-full border border-line px-3 py-1 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
          >
            全部存档
          </button>
          <button
            type="button"
            data-cg-clear
            disabled={collected.size === 0}
            onClick={() => setClearOpen(true)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-ui-2xs transition-colors',
              collected.size === 0
                ? 'cursor-not-allowed border-line/60 text-ink-faint/60'
                : 'border-line text-ink-muted hover:border-missing hover:text-missing',
            )}
          >
            清除已收集
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-5 tab:flex-col tab:gap-3">
        <aside
          data-cg-groups
          className="flex w-[210px] shrink-0 flex-col overflow-y-auto rounded-ui-md border border-line bg-surface p-2 [scrollbar-gutter:stable] tab:w-full tab:overflow-x-auto tab:p-1.5"
        >
          <div className="flex flex-col gap-0.5 tab:flex-row tab:gap-1.5">
            {groupButton('all', '全部', data.items.length, collected.size, undefined, true)}
            {data.groups.map((group) => {
              const count = groupCounts.get(group.id) ?? { total: group.count, done: 0 };
              return groupButton(group.id, group.name, count.total, count.done, group.avatar);
            })}
          </div>
        </aside>

        <div
          data-cg-panel
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-ui-md border border-line bg-surface"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2">
            <h2 className="text-ui-sm font-semibold text-ink">{activeName}</h2>
            <span className="text-ui-2xs tabular-nums text-ink-faint">
              {groupDone} / {groupItems.length} 已收集
            </span>
            <button
              type="button"
              data-cg-filter
              aria-pressed={onlyMissing}
              onClick={() => setOnlyMissing((value) => !value)}
              className={cn(
                'ml-auto rounded-full border px-3 py-1 text-ui-2xs transition-colors',
                onlyMissing
                  ? 'border-brand-line bg-brand-soft font-semibold text-brand-strong'
                  : 'border-line text-ink-muted hover:text-brand-strong',
              )}
            >
              {onlyMissing ? '显示全部' : '只看未收集'}
            </button>
          </div>

          <div
            data-cg-scroll
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]"
          >
            {filtered.length === 0 ? (
              <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-10 text-center text-ui-xs text-ink-faint">
                {onlyMissing ? '这个分组已经全部收集完了。' : '这个分组暂时没有 CG。'}
              </p>
            ) : (
              <>
                <ul
                  data-cg-grid
                  data-cg-count={visible.length}
                  className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]"
                >
                  {visible.map((item) => {
                    const link = linkFor(item);
                    return (
                      <li key={item.id}>
                        <CgCard
                          item={item}
                          collected={collected.has(item.id)}
                          group={groupId === 'all' ? groupById.get(item.groupId) : undefined}
                          guideHref={link ? cgGuideHref(link) : undefined}
                          guideTitle={link ? cgGuideTitle(link) : undefined}
                          onToggle={() => toggle(item.id)}
                          onOpen={(trigger) => openLightbox(item.id, visibleIds, trigger)}
                        />
                      </li>
                    );
                  })}
                </ul>
                {visible.length < filtered.length && (
                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      data-cg-load-more
                      onClick={() => setLimit((value) => value + PAGE_SIZE)}
                      className="rounded-full border border-line px-4 py-1.5 text-ui-2xs text-ink-muted hover:border-brand-line hover:text-brand-strong"
                    >
                      加载更多（还有 {filtered.length - visible.length} 张）
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {lightbox && lightboxItem && (
        <CgLightbox
          item={lightboxItem}
          groupName={data.groups.find((group) => group.id === lightboxItem.groupId)?.name ?? '全部'}
          collected={collected.has(lightboxItem.id)}
          position={lightboxIndex + 1}
          total={lightbox.ids.length}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex >= 0 && lightboxIndex < lightbox.ids.length - 1}
          guideHref={(() => {
            const link = linkFor(lightboxItem);
            return link ? cgGuideHref(link) : undefined;
          })()}
          onPrev={() => stepLightbox(-1)}
          onNext={() => stepLightbox(1)}
          onToggle={() => toggle(lightboxItem.id)}
          onClose={closeLightbox}
        />
      )}

      {archiveOpen && (
        <div
          data-cg-archive-modal
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={() => setArchiveOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-[440px] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <SaveArchivePanel />
          </div>
        </div>
      )}

      {clearOpen && (
        <div
          data-cg-clear-modal
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={() => setClearOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cg-clear-title"
            className="w-full max-w-[420px] rounded-ui-md border border-line bg-surface p-5 shadow-soft"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="cg-clear-title" className="text-ui-md font-bold text-ink">
              清除全部已收集？
            </h2>
            <p className="mt-2.5 text-ui-xs leading-[1.8] text-ink-muted">
              会取消当前已收集的 {collected.size} 张（共 {data.items.length} 张）的勾选。
              只清空 CG 收集，事件追踪进度与备忘录都不受影响；想留底的话，先在「全部存档」导出。
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                data-cg-clear-confirm
                onClick={clearAll}
                className="flex-1 rounded-ui-sm border border-missing bg-missing-soft px-3 py-2 text-ui-xs font-semibold text-missing transition-colors hover:border-missing"
              >
                确认清除
              </button>
              <button
                type="button"
                data-cg-clear-cancel
                onClick={() => setClearOpen(false)}
                className="flex-1 rounded-ui-sm border border-line px-3 py-2 text-ui-xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {clearedSnapshot && (
        <div
          data-cg-clear-undo-toast
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-gold-line bg-gold-soft px-4 py-2 shadow-soft"
        >
          <span className="text-ui-xs text-gold">
            已清除 {clearedSnapshot.size} 张收集记录
          </span>
          <button
            type="button"
            data-cg-clear-undo
            onClick={undoClear}
            className="rounded-ui-xs border border-gold-line bg-surface px-2.5 py-1 text-ui-xs font-semibold text-gold transition-colors hover:border-gold"
          >
            撤销
          </button>
          <button
            type="button"
            data-cg-clear-undo-dismiss
            onClick={() => setClearedSnapshot(null)}
            aria-label="关闭"
            className="text-ui-2xs text-gold/70 transition-colors hover:text-gold"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
