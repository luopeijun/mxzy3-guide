import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { readCg, writeCg, CG_CHANGED_EVENT } from '../../lib/cg';
import { buildCgGuideLinks, cgGuideHref, cgGuideTitle, LUOUSANG_PREFIX } from '../../lib/cgLinks';
import type { CgGuideLink } from '../../lib/cgLinks';
import { readCgOrigin } from '../../lib/cgOrigin';
import { cgGroupId, cgItemId, rememberCgGroup, writeCgGroupHash } from '../../hooks/useHashSelection';
import { useGuideContext } from '../../hooks/useGuideContext';
import { MAIN_CG_CONFIG, type CgSiteConfig } from '../../lib/cgConfig';
import type { CgData, CgItem } from '../../types/cg';
import SmartImage from '../../ui/SmartImage';
import CgCard from './CgCard';
import CgLightbox from './CgLightbox';
import SaveArchivePanel from '../tracker/SaveArchivePanel';

const PAGE_SIZE = 60;
/** 撤销条停留时长：1.5s 内没点就自己收起，免得一直悬在底部挡住最后一行卡片。 */
const UNDO_TOAST_MS = 1500;
const FLASH_CLASS = 'anchor-flash';

/** 卡片尺寸：大/中/小对应网格最小列宽。中即原默认 380px；
 *  小档列宽收窄到 300px，CG 序号移到图片上后底栏只剩「收集+名称+攻略」，
 *  名称单行即可完整显示（不再换行），密度仍比中档高。 */
type CgSize = 'sm' | 'md' | 'lg';
const SIZE_MIN_WIDTH: Record<CgSize, number> = { sm: 300, md: 380, lg: 520 };

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

/** 一个条目的真实收集键：共享 CG 用 collectionId（两人同图同键，点一次双方亮），
 *  其余用自身 id。主站条目无 collectionId，自然退化为 id，行为零变化。 */
const collectionKey = (item: CgItem): string => item.collectionId ?? item.id;

/** 人物内顺序的自定义覆盖：groupId -> 有序的 itemId 数组，存 localStorage。
 *  与 cg.json 的 order/code 解耦：重新生成脚本只动图片与原始编号，绝不读这里，
 *  所以「在页面里微调的顺序」永远不会被下一次生成冲掉（显示层始终以它为准）。 */
const CG_ORDER_KEY = 'sweet.cg.order.v1';
const CG_ORDER_VERSION = 1;

function readCgOrder(key: string): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { order?: Record<string, string[]> };
    return parsed.order && typeof parsed.order === 'object' ? parsed.order : {};
  } catch {
    return {};
  }
}

function writeCgOrder(key: string, order: Record<string, string[]>): void {
  try {
    localStorage.setItem(key, JSON.stringify({ version: CG_ORDER_VERSION, order }));
  } catch {
    // 隐私模式 / 配额不足：本次会话内仍生效，只是不落盘。
  }
}

interface Props {
  data: CgData;
  /** 站点差异（存储键、攻略跳转、存档、文案）。省略即主站，行为零变化。 */
  config?: CgSiteConfig;
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
      <SmartImage
        data-cg-group-avatar
        src={avatar}
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
 *  「全部」才需要分页。收集开关在卡片底部信息栏，和「点图片看大图」互不干扰；
 *  右上角只留一个不点击的已收状态点，方便一眼扫过去。 */
export default function CgApp({ data, config = MAIN_CG_CONFIG }: Props) {
  /** 收集键可能是共享 CG 的 `collectionId`（不在 item.id 里），所以白名单要
   *  把每个条目的 id 与 collectionId 都收进来，`sanitiseCg` 才不会把共享键当
   *  作脏数据丢掉。主站条目没有 collectionId，`?? id` 使其等价于原逻辑。 */
  const validIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of data.items) {
      set.add(item.id);
      set.add(item.collectionId ?? item.id);
    }
    return set;
  }, [data.items]);
  const [collected, setCollected] = useState<Set<string>>(() => readCg(validIds, config.storageKey));
  /** 分组记在 URL 里（`#/cg/group/<id>`），刷新、复制链接回来还是同一个人物。 */
  const [groupId, setGroupId] = useState(() => cgGroupId() || 'all');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  /** 卡片尺寸：纯本地面板状态，不持久化（刷新回默认「中」），也不进进度存档。 */
  const [size, setSize] = useState<CgSize>('md');
  /** 清空前的快照：误点一次不用先导出也能退回来，仅存活在本次页面会话里。 */
  const [clearedSnapshot, setClearedSnapshot] = useState<Set<string> | null>(null);
  /** 一键「全部收集」前的快照与本次新增张数：同样可撤销，仅存活于本次页面会话。 */
  const [collectUndo, setCollectUndo] = useState<{ prev: Set<string>; added: number } | null>(null);
  /** 攻略里点 CG 徽标进来的 `#/cg/<id>`：切到对应分组、滚到那张卡并闪一下。 */
  const [focusId, setFocusId] = useState(() => cgItemId());
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // 人物内顺序的自定义覆盖（仅甜站开启 allowReorder 时读取 / 渲染）。
  const [savedOrder, setSavedOrder] = useState<Record<string, string[]>>(() =>
    config.allowReorder ? readCgOrder(CG_ORDER_KEY) : {},
  );
  const [reorderMode, setReorderMode] = useState(false);
  /** 编辑中的顺序草稿：仅影响当前分组，未保存不落盘。 */
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  /** 拖拽中的卡片 id 与当前悬停落点 id，只用于视觉高亮。落点的真实移动靠
   *  onDrop 里读 dataTransfer 携带的被拖 id，不依赖这两个 state 的时序。 */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // 攻略 → CG 的落点索引（事件块的 cgIds 是数据来源，这里只是反查表）。
  const guideData = useGuideContext();
  const guideLinks = useMemo(
    () => (config.guideLinks && guideData
      ? buildCgGuideLinks(guideData)
      : new Map<string, CgGuideLink[]>()),
    [config.guideLinks, guideData],
  );

  /**
   * 先认事件级映射（`cgIds` 反查），再退到页面级落点（`cg.json` 的 `guide`）。
   * 一张 CG 有好几个事件都成立时（路欧桑五个分支页各写了一遍同一段剧情），
   * 优先回到刚才点进来的那一页；直接从深链进来则先挑「路欧桑剧情整理」的落点
   * （三人恋情只在艺人页浏览，跳转统一走整理页），都没有才用第一个。
   * 美丽之星写真集走页面级，但落点唯一（同一个事件），所以带上 `anchor`。
   */
  const linkFor = useCallback(
    (item: CgItem): CgGuideLink | undefined => {
      if (!config.guideLinks) return undefined;
      const candidates = guideLinks.get(item.id);
      if (candidates?.length) {
        const origin = readCgOrigin(item.id);
        const home = origin
          && candidates.find((c) => c.nodeId === origin.nodeId && c.anchor === origin.anchor);
        if (home) return home;
        return candidates.find((c) => c.nodeId.startsWith(LUOUSANG_PREFIX)) ?? candidates[0];
      }
      return item.guide
        ? { nodeId: item.guide.nodeId, nodeTitle: item.guide.title, anchor: item.guide.anchor }
        : undefined;
    },
    [guideLinks, config.guideLinks],
  );

  // A save import writes the CG collection straight to localStorage and fires
  // this event, so re-read instead of requiring a reload.
  useEffect(() => {
    const onChanged = () => setCollected(readCg(validIds, config.storageKey));
    window.addEventListener(CG_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CG_CHANGED_EVENT, onChanged);
  }, [validIds, config.storageKey]);

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
      writeCg(next, config.storageKey);
      return next;
    });
  };

  /** 只清空 CG 收集：`guide.progress.v1`（事件追踪）与 `guide.memo.v1`（备忘录）
   *  都各自独立存储，这里不碰，重置追踪进度也不会反过来清掉 CG。 */
  const clearAll = () => {
    const previous = collected;
    const empty = new Set<string>();
    writeCg(empty, config.storageKey);
    setCollected(empty);
    setClearedSnapshot(previous.size > 0 ? previous : null);
    setClearOpen(false);
  };

  const undoClear = () => {
    if (!clearedSnapshot) return;
    writeCg(clearedSnapshot, config.storageKey);
    setCollected(clearedSnapshot);
    setClearedSnapshot(null);
  };

  /** 当前分组「按最终顺序排好的 itemId 列表」：编辑中用草稿，否则用已保存，
   *  都没有时用 cg.json 的原始顺序。 */
  const orderIdsFor = (gid: string): string[] => {
    if (reorderMode && gid === groupId && gid !== 'all') {
      return draftOrder ?? savedOrder[gid] ?? displayItems.sortedByGroup.get(gid)!.map((item) => item.id);
    }
    return savedOrder[gid] ?? displayItems.sortedByGroup.get(gid)!.map((item) => item.id);
  };

  /** 在分组内把某张 CG 上移 / 下移一位（dir = -1 上、+1 下）。 */
  const moveItem = (gid: string, id: string, dir: -1 | 1) => {
    const list = [...orderIdsFor(gid)];
    const from = list.indexOf(id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    setDraftOrder(list);
  };

  /** 把被拖卡片 id 移动到 targetId 之前（拖到哪张卡之前就插到它前面）；
   *  跨长距离一次到位，不必一次次点 ↑/↓。 */
  const moveItemTo = (gid: string, id: string, targetId: string) => {
    if (id === targetId) return;
    const list = [...orderIdsFor(gid)];
    const from = list.indexOf(id);
    const to = list.indexOf(targetId);
    if (from < 0 || to < 0) return;
    list.splice(from, 1);
    const insertAt = list.indexOf(targetId);
    list.splice(insertAt, 0, id);
    setDraftOrder(list);
  };

  /** 进入排序模式：用当前最终顺序初始化草稿，避免从空草稿开始；
   *  并把分页上限拉到极大，让整组卡片一次铺开，否则被隐藏的卡片没法挪动。 */
  const enterReorder = () => {
    if (groupId === 'all') return;
    setDraftOrder([...orderIdsFor(groupId)]);
    setLimit(Number.MAX_SAFE_INTEGER);
    setReorderMode(true);
  };

  /** 退出排序模式：save=true 则把草稿落到已保存并落盘，否则丢弃草稿。
   *  顺手把分页上限拨回默认，免得排序时拉满的全组卡在「全部/其他分组」页里。 */
  const exitReorder = (save: boolean) => {
    if (save && groupId !== 'all' && draftOrder) {
      const next = { ...savedOrder, [groupId]: draftOrder };
      setSavedOrder(next);
      writeCgOrder(CG_ORDER_KEY, next);
    }
    setReorderMode(false);
    setDraftOrder(null);
    setLimit(PAGE_SIZE);
  };

  /** 导出全部自定义顺序为 JSON 文件，发给开发者即可烘焙进 cg.json（图片不动）。 */
  const exportOrder = () => {
    const blob = new Blob([JSON.stringify({ version: CG_ORDER_VERSION, order: savedOrder }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sweet-cg-order.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  /** 一键收集当前分组（「全部」页就是全部）里还没收的 CG；已收的不重复加。
   *  按 collectionId 去重：共享 CG 只加一次。 */
  const collectAll = () => {
    if (groupItems.length - groupDone <= 0) return;
    const next = new Set(collected);
    let added = 0;
    for (const item of groupItems) {
      const key = collectionKey(item);
      if (!next.has(key)) {
        next.add(key);
        added += 1;
      }
    }
    writeCg(next, config.storageKey);
    setCollected(next);
    setCollectUndo({ prev: collected, added });
  };

  const undoCollect = () => {
    if (!collectUndo) return;
    writeCg(collectUndo.prev, config.storageKey);
    setCollected(collectUndo.prev);
    setCollectUndo(null);
  };

  // 撤销条到点自动收起；点撤销 / 关闭都会把 snapshot 置空，从而清掉定时器。
  useEffect(() => {
    if (!clearedSnapshot) return;
    const timer = window.setTimeout(() => setClearedSnapshot(null), UNDO_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [clearedSnapshot]);

  // 「全部收集」的撤销条同样到点自动收起。
  useEffect(() => {
    if (!collectUndo) return;
    const timer = window.setTimeout(() => setCollectUndo(null), UNDO_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [collectUndo]);

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

  /** 把「人物内自定义顺序」套到数据上：返回每个 itemId 的最终 order / code，以及
   *  每个分组按最终顺序排好的条目列表。编辑中的分组（reorderMode 且不是全部）用
   *  draftOrder，其余用已保存的 savedOrder；都没有就退回 cg.json 的原始 order。
   *  code 一律按最终位置重排成 CG 01 / CG 02…，所以调顺序后编号自动连号。 */
  const displayItems = useMemo(() => {
    const orderMap = new Map<string, { order: number; code: string }>();
    const sortedByGroup = new Map<string, CgItem[]>();
    for (const group of data.groups) {
      const items = data.items.filter((item) => item.groupId === group.id);
      const liveIds = reorderMode && groupId !== 'all' && group.id === groupId
        ? (draftOrder ?? savedOrder[group.id] ?? null)
        : (savedOrder[group.id] ?? null);
      let ordered: CgItem[];
      if (liveIds) {
        const pos = new Map(liveIds.map((id, index) => [id, index]));
        ordered = [...items].sort((a, b) => {
          const pa = pos.has(a.id) ? (pos.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
          const pb = pos.has(b.id) ? (pos.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
          if (pa !== pb) return pa - pb;
          return a.order - b.order;
        });
      } else {
        ordered = [...items].sort((a, b) => a.order - b.order);
      }
      ordered.forEach((item, index) => {
        orderMap.set(item.id, { order: index + 1, code: `CG ${String(index + 1).padStart(2, '0')}` });
      });
      sortedByGroup.set(group.id, ordered);
    }
    return { orderMap, sortedByGroup };
  }, [data.items, data.groups, savedOrder, draftOrder, reorderMode, groupId]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, { total: number; done: number }>();
    for (const item of data.items) {
      const entry = counts.get(item.groupId) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (collected.has(collectionKey(item))) entry.done += 1;
      counts.set(item.groupId, entry);
    }
    return counts;
  }, [data.items, collected]);

  const orderedAll = useMemo(
    () => data.groups.flatMap((group) => displayItems.sortedByGroup.get(group.id) ?? []),
    [data.groups, displayItems],
  );
  const groupItems = useMemo(
    () => (groupId === 'all' ? orderedAll : (displayItems.sortedByGroup.get(groupId) ?? [])),
    [groupId, orderedAll, displayItems],
  );
  const groupDone = useMemo(
    () => groupItems.reduce((sum, item) => sum + (collected.has(collectionKey(item)) ? 1 : 0), 0),
    [groupItems, collected],
  );
  // 排序模式下不叠加「只看未收集」，否则被隐藏的卡片没法挪动。
  const effectiveOnlyMissing = reorderMode ? false : onlyMissing;
  const filtered = useMemo(
    () => (effectiveOnlyMissing
      ? groupItems.filter((item) => !collected.has(collectionKey(item)))
      : groupItems),
    [groupItems, effectiveOnlyMissing, collected],
  );
  const visible = useMemo(
    () => filtered.slice(0, limit).map((item) => ({
      ...item,
      code: displayItems.orderMap.get(item.id)?.code ?? item.code,
    })),
    [filtered, limit, displayItems],
  );
  const visibleIds = useMemo(() => visible.map((item) => item.id), [visible]);
  /** 排序模式下当前分组的实时顺序（草稿），用来判定每张卡是否还能上移 / 下移。 */
  const liveOrderIds = reorderMode && groupId !== 'all' ? orderIdsFor(groupId) : [];

  const activeName = groupId === 'all'
    ? '全部'
    : (data.groups.find((group) => group.id === groupId)?.name ?? '全部');
  // 总数用唯一的「可收集张数」（共享 CG 只算一次），而不是条目数；主站无共享，
  // meta.itemCount 即条目数，因此主站这一行与原行为完全一致。
  const percent = data.meta.itemCount
    ? Math.round((collected.size / data.meta.itemCount) * 100)
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
          共 {data.meta.itemCount} 张 · {data.meta.groupCount} 个分组{config.metaNote}
          {data.meta.missingImageCount > 0 && ` · ${data.meta.missingImageCount} ${config.missingImageNote}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1.5 text-ui-2xs tabular-nums text-ink-faint">
          <span data-cg-progress className="shrink-0 whitespace-nowrap">
            已收集 {collected.size} / {data.meta.itemCount}
          </span>
          <span className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-line phone:hidden">
            <span
              className="block h-full rounded-full bg-brand transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </span>
          <div
            data-cg-size
            className="flex shrink-0 items-center rounded-full border border-line p-0.5"
          >
            {(['lg', 'md', 'sm'] as const).map((value) => (
              <button
                key={value}
                type="button"
                data-cg-size-btn={value}
                aria-pressed={size === value}
                aria-label={`卡片尺寸：${value === 'lg' ? '大' : value === 'md' ? '中' : '小'}`}
                onClick={() => setSize(value)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-ui-2xs font-medium leading-none transition-colors',
                  size === value
                    ? 'bg-brand text-white'
                    : 'text-ink-muted hover:text-brand-strong',
                )}
              >
                {value === 'lg' ? '大' : value === 'md' ? '中' : '小'}
              </button>
            ))}
          </div>
          {config.archive && (
            <button
              type="button"
              data-cg-archive
              onClick={() => setArchiveOpen(true)}
              className="shrink-0 whitespace-nowrap rounded-full border border-line px-3 py-1 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
            >
              全部存档
            </button>
          )}
          <button
            type="button"
            data-cg-collect-all
            disabled={groupItems.length - groupDone <= 0}
            onClick={collectAll}
            title={`收集「${activeName}」分组里所有未收集的 CG`}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-ui-2xs transition-colors',
              groupItems.length - groupDone <= 0
                ? 'cursor-not-allowed border-line/60 text-ink-faint/60'
                : 'border-brand text-brand-strong hover:bg-brand-soft',
            )}
          >
            全部收集
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
            {groupButton('all', '全部', data.meta.itemCount, collected.size, undefined, true)}
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
            {reorderMode ? (
              <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-ui-2xs">
                <span className="text-ink-faint">拖动卡片（或 ↑/↓）调整「{activeName}」内的 CG 顺序</span>
                <button
                  type="button"
                  data-cg-reorder-export
                  onClick={exportOrder}
                  className="shrink-0 whitespace-nowrap rounded-full border border-line px-3 py-1 text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
                >
                  导出顺序
                </button>
                <button
                  type="button"
                  data-cg-reorder-cancel
                  onClick={() => exitReorder(false)}
                  className="shrink-0 whitespace-nowrap rounded-full border border-line px-3 py-1 text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
                >
                  取消
                </button>
                <button
                  type="button"
                  data-cg-reorder-save
                  onClick={() => exitReorder(true)}
                  className="shrink-0 whitespace-nowrap rounded-full border border-brand bg-brand px-3 py-1 font-semibold text-white transition-colors hover:bg-brand-strong"
                >
                  保存顺序
                </button>
              </div>
            ) : (
              <>
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
                {config.allowReorder && groupId !== 'all' && (
                  <button
                    type="button"
                    data-cg-reorder
                    onClick={enterReorder}
                    title={`调整「${activeName}」分组内 CG 的先后顺序`}
                    className="shrink-0 whitespace-nowrap rounded-full border border-brand-line px-3 py-1 text-ui-2xs font-medium text-brand-strong transition-colors hover:bg-brand-soft"
                  >
                    调整顺序
                  </button>
                )}
              </>
            )}
          </div>

          <div
            data-cg-scroll
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]"
          >
            {filtered.length === 0 ? (
              <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-10 text-center text-ui-xs text-ink-faint">
                {onlyMissing ? config.emptyFilteredText : config.emptyText}
              </p>
            ) : (
              <>
                <ul
                  data-cg-grid
                  data-cg-count={visible.length}
                  data-cg-size={size}
                  style={{
                    gridTemplateColumns: `repeat(auto-fill, minmax(min(${SIZE_MIN_WIDTH[size]}px, 100%), 1fr))`,
                  }}
                  className="grid items-start gap-3"
                >
                  {visible.map((item) => {
                    const link = linkFor(item);
                    const key = collectionKey(item);
                    const pos = liveOrderIds.indexOf(item.id);
                    return (
                      <li key={item.id}>
                        <CgCard
                          item={item}
                          collected={collected.has(key)}
                          size={size}
                          group={groupId === 'all' ? groupById.get(item.groupId) : undefined}
                          guideHref={link ? cgGuideHref(link) : undefined}
                          guideTitle={link ? cgGuideTitle(link) : undefined}
                          showName={config.showName}
                          reorder={reorderMode}
                          onMoveUp={() => moveItem(groupId, item.id, -1)}
                          onMoveDown={() => moveItem(groupId, item.id, 1)}
                          moveUpDisabled={reorderMode && pos <= 0}
                          moveDownDisabled={reorderMode && pos >= liveOrderIds.length - 1}
                          onDragStartCard={() => setDragId(item.id)}
                          onDragOverCard={() => { if (dragId && dragId !== item.id) setDragOverId(item.id); }}
                          onDropCard={(draggedId) => {
                            setDragId(null);
                            setDragOverId(null);
                            if (draggedId) moveItemTo(groupId, draggedId, item.id);
                          }}
                          onDragEndCard={() => { setDragId(null); setDragOverId(null); }}
                          isDragging={reorderMode && dragId === item.id}
                          isDragOver={reorderMode && dragOverId === item.id}
                          onToggle={() => toggle(key)}
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
          collected={collected.has(collectionKey(lightboxItem))}
          position={lightboxIndex + 1}
          total={lightbox.ids.length}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex >= 0 && lightboxIndex < lightbox.ids.length - 1}
          guideHref={(() => {
            const link = linkFor(lightboxItem);
            return link ? cgGuideHref(link) : undefined;
          })()}
          showName={config.showName}
          showCondition={config.showCondition}
          onPrev={() => stepLightbox(-1)}
          onNext={() => stepLightbox(1)}
          onToggle={() => toggle(collectionKey(lightboxItem))}
          onClose={closeLightbox}
        />
      )}

      {config.archive && archiveOpen && (
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
              会取消当前已收集的 {collected.size} 张（共 {data.meta.itemCount} 张）的勾选。
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

      {collectUndo && (
        <div
          data-cg-collect-undo-toast
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-brand-line bg-brand-soft px-4 py-2 shadow-soft"
        >
          <span className="text-ui-xs text-brand-strong">
            已收集 {collectUndo.added} 张 CG
          </span>
          <button
            type="button"
            data-cg-collect-undo
            onClick={undoCollect}
            className="rounded-ui-xs border border-brand-line bg-surface px-2.5 py-1 text-ui-xs font-semibold text-brand-strong transition-colors hover:border-brand"
          >
            撤销
          </button>
          <button
            type="button"
            data-cg-collect-undo-dismiss
            onClick={() => setCollectUndo(null)}
            aria-label="关闭"
            className="text-ui-2xs text-brand-strong/70 transition-colors hover:text-brand-strong"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
