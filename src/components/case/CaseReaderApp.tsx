import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import EmptyState from '../EmptyState';
import { companyDot, companyText } from '../notices/infoStyle';
import { useGuideContext } from '../../hooks/useGuideContext';
import { cn } from '../../lib/cn';
import { findNodePath } from '../../lib/guide';
import {
  ARTIST_DIRECTORY, ATTRS, EMPTY_TABLES, NOTICE_COUNT_LABELS, NOTICE_COUNT_UNITS, NOTICE_TOTAL_LABEL,
  noticeLabel, noticeUnit, riskOf, shootableDays,
  buildGroupRecord, canTakeNotice, canTakeRole, isAcceptable, isGroupRole, matchGroupRole, matchRole, moneyText, parseSave, toCsv,
  type ArtistEvent, type ArtistOption, type ArtistStats, type CaseNotice, type CaseTables,
  type GroupRecord, type GroupWork, type OwnedItem, type ParseResult, type RoleRecord, type SelfMadeCast,
  type SelfMadeNotice, type SelfMadeStatus, type ShootingNotice, type ShootingRisk,
  type TitleLine, type TitleMeta, type WorkRecord,
} from '../../lib/caseParser';
import type { TitleGapItem, TitleNext } from '../../lib/titleLadder';
import type { GuideData } from '../../types/guide';

// 数据文件可独立更新、不随 JS 构建走 hash；加时间戳绕开浏览器/CDN 缓存，
// 否则表新增字段后已打开的页面会一直读到缺字段的旧 JSON（如礼物好感列全为 -）。
const TABLES_URL = `${import.meta.env.BASE_URL}data/case-tables.json?v=${Date.now()}`;

const CATEGORY_CLASS: Record<string, string> = {
  唱片: 'bg-tag-talk-soft text-tag-talk',
  广告: 'bg-tag-follow-soft text-tag-follow',
  电影: 'bg-tag-manual-soft text-tag-manual',
  电视剧: 'bg-tag-news-soft text-tag-news',
  主持: 'bg-tag-scene-soft text-tag-scene',
  时装: 'bg-tag-auto-soft text-tag-auto',
  舞台剧: 'bg-tag-talk-soft text-tag-talk',
  特别: 'bg-alert-soft text-alert',
};

/** 艺人速查里的在拍小块：用同一套通告类别色，跟表格里的类型胶囊对得上。 */
const ACTIVE_NOTICE_TILE_CLASS: Record<string, string> = {
  唱片: 'border-l-tag-talk bg-tag-talk-soft/70',
  广告: 'border-l-tag-follow bg-tag-follow-soft/70',
  电影: 'border-l-tag-manual bg-tag-manual-soft/70',
  电视剧: 'border-l-tag-news bg-tag-news-soft/70',
  主持: 'border-l-tag-scene bg-tag-scene-soft/70',
  时装: 'border-l-tag-auto bg-tag-auto-soft/70',
  舞台剧: 'border-l-tag-talk bg-tag-talk-soft/70',
  特别: 'border-l-alert bg-alert-soft/70',
};

/** One artist the save marks as signed, plus the state block holding their numbers. */
interface SignedArtist {
  option: ArtistOption;
  artist: ArtistStats | null;
}

/** 挂在右栏艺人名下的在拍通告：拍摄中 tab 和自制通告里状态为拍摄中的那一条。
 *  团体通告同一份进度会复制给每位成员，但只算一个块（key 去重）。 */
interface ActiveArtistNotice {
  key: string;
  source: 'shooting' | 'selfMade';
  code: string;
  name: string;
  category: string;
  startDate: string;
  endDate: string;
  doneDays: number;
  workDays: number;
  risk: ShootingRisk;
  groupName?: string;
}

function chipClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-ui-2xs transition-colors',
    active
      ? 'border-brand bg-brand font-semibold text-white'
      : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
  );
}

/** 作品明细里的角色胶囊：主角 / 外景主持 / 主持人用品牌粉提亮，
 *  配角与助理主持压成灰底。 */
function workRoleClass(role: string): string {
  const featured = role.includes('主角') || role === '外景主持' || role === '主持人';
  return featured
    ? 'rounded bg-brand-soft px-1 font-semibold text-brand-strong'
    : 'rounded bg-line px-1 text-ink-muted';
}

/** 把「拍摄中」和「自制通告·拍摄中」接到旗下艺人头上。
 *  团体通告按存档里的团体成员展开：两位成员都挂同一块，进度也用队长那一份，
 *  不给队员另算 0 天。没有团队记录的仍只挂在接演人本人名下。 */
function buildActiveArtistNotices(
  result: ParseResult,
  signed: SignedArtist[],
  groups: GroupRecord[],
): Map<number, ActiveArtistNotice[]> {
  const byArtist = new Map<number, ActiveArtistNotice[]>();
  const signedIds = new Set(signed.map(({ option }) => option.id));
  const groupOf = (artistId: number): GroupRecord | null =>
    groups.find((group) => group.memberIds.includes(artistId)) ?? null;
  const add = (artistId: number, notice: ActiveArtistNotice) => {
    if (!signedIds.has(artistId)) return;
    const list = byArtist.get(artistId) ?? [];
    if (list.some((item) => item.key === notice.key)) return;
    list.push(notice);
    byArtist.set(artistId, list);
  };

  for (const notice of result.shooting) {
    const groupRole = notice.roles.some(isGroupRole);
    for (const cast of notice.casts) {
      if (cast.status === 'done') continue;
      const group = groupRole ? groupOf(cast.artistId) : null;
      const targets = group ? group.memberIds : [cast.artistId];
      const item: ActiveArtistNotice = {
        key: `shooting:${notice.code}`,
        source: 'shooting',
        code: notice.code,
        name: notice.name,
        category: notice.category,
        startDate: notice.startDate,
        endDate: notice.endDate,
        doneDays: cast.doneDays,
        workDays: cast.workDays,
        risk: cast.risk,
        groupName: group?.name,
      };
      for (const id of targets) add(id, item);
    }
  }

  for (const notice of result.selfMade) {
    if (notice.status !== 'shooting') continue;
    for (const cast of notice.casts) {
      if (!cast.mine && !cast.group) continue;
      const group = cast.group ? groupOf(cast.artistId) : null;
      const targets = group ? group.memberIds : [cast.artistId];
      const risk: ShootingRisk = cast.needDays > 0
        ? riskOf(
          cast.needDays,
          shootableDays(notice.daysLeft, notice.daysPerWeek),
          notice.daysPerWeek,
        )
        : 'ok';
      const item: ActiveArtistNotice = {
        key: `selfMade:${notice.code}`,
        source: 'selfMade',
        code: notice.code,
        name: notice.name,
        category: notice.category,
        startDate: notice.startDate,
        endDate: notice.endDate,
        doneDays: cast.doneDays,
        workDays: cast.workDays,
        risk,
        groupName: group?.name ?? cast.group?.name,
      };
      for (const id of targets) add(id, item);
    }
  }
  return byArtist;
}

const SCENE_GUIDE_ID = 'game-guide/scenes';

/** 解锁方式直接取「场景开启方法」页，避免在这里另抄一份会过期的文案。
 *  只取每个场景标题下的第一段、选项和提示：开罗段落后面还有真品概率一类
 *  的栏目说明，那些不是解锁条件，不能塞进 tooltip。 */
function collectSceneUnlockHints(guide: GuideData | null): Record<string, string[]> {
  const path = guide ? findNodePath(guide, SCENE_GUIDE_ID) : [];
  const node = path.length ? path[path.length - 1] : null;
  if (!node) return {};

  const hints: Record<string, string[]> = {};
  let current = '';
  let firstParagraphTaken = false;
  for (const block of node.blocks) {
    if (block.kind === 'section') {
      current = '';
      continue;
    }
    if (block.kind === 'heading') {
      current = block.text.split(/[（(]/, 1)[0].trim();
      firstParagraphTaken = false;
      if (current && !hints[current]) hints[current] = [];
      continue;
    }
    if (!current || !hints[current] || !block.text.trim()) continue;
    if (block.kind === 'paragraph') {
      if (firstParagraphTaken) continue;
      firstParagraphTaken = true;
      hints[current].push(block.text.trim());
      continue;
    }
    if (block.kind === 'option' || block.kind === 'note') {
      hints[current].push(block.kind === 'note' ? `提示：${block.text.trim()}` : block.text.trim());
    }
  }
  return hints;
}

/** 场景格 2 列 / 4 列切换，tooltip 跟着靠右，别让它冲出容器。 */
function sceneTooltipAlign(index: number): string {
  return cn(
    index % 2 === 1 ? 'right-0 left-auto' : 'left-0 right-auto',
    index % 4 === 3 ? 'sm:right-0 sm:left-auto' : 'sm:left-0 sm:right-auto',
  );
}

/** 公司信息里的一格：上面标签、下面数字。 */
function CompanyStat({
  label, value, attr, alert, hint,
}: {
  label: string;
  value: string;
  attr: string;
  alert?: boolean;
  /** 鼠标悬停时的完整数字（资金拆成亿 / 万后还能看到原值）。 */
  hint?: string;
}) {
  return (
    <div
      data-case-company-stat={attr}
      title={hint}
      className="rounded-ui-md border border-line bg-surface px-2.5 py-1.5"
    >
      <div className="text-ui-2xs text-ink-faint">{label}</div>
      <div className={cn(
        'mt-0.5 whitespace-nowrap text-ui-sm font-bold tabular-nums',
        alert ? 'text-alert' : 'text-ink',
      )}>
        {value}
      </div>
    </div>
  );
}

/** 通告统计的小胶囊 + 悬停作品清单，团体卡和艺人卡共用一套。 */
function WorkCountChip({
  label, value, unit, works, title, showRole = false, group = false, dataName, dataNoticeIndex,
}: {
  label: string;
  value: number;
  unit?: string;
  works: readonly (GroupWork | WorkRecord)[];
  title: string;
  showRole?: boolean;
  group?: boolean;
  dataName?: string;
  dataNoticeIndex?: number;
}) {
  const cardData = group
    ? { 'data-case-group-works-card': '' }
    : { 'data-case-artist-works-card': '' };
  const rowData = group
    ? { 'data-case-group-work': '' }
    : { 'data-case-artist-work': '' };
  return (
    <span className="group relative inline-flex">
      <span
        {...(dataName ? { [dataName]: '' } : {})}
        data-notice-index={dataNoticeIndex}
        tabIndex={0}
        role="button"
        className="cursor-help rounded bg-count-soft px-1.5 py-0.5 text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand-line"
      >
        {label} <b>{value}</b>{unit}
      </span>
      {works.length > 0 && (
        <span
          {...cardData}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 w-[320px] pb-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        >
          <span className="block rounded-ui-sm border border-line bg-surface p-2 text-left shadow-lg">
            <span className="mb-1 flex items-baseline gap-1">
              <b className="text-ui-2xs text-ink">{title}</b>
              <span className="text-ui-2xs text-ink-faint">{works.length} 条（按发生顺序）</span>
            </span>
            <span
              data-case-works-scroll
              className="block max-h-[240px] overflow-y-auto overscroll-contain pr-1"
            >
              {works.map((work, index) => (
                <span
                  key={`${work.workCode}-${'order' in work ? work.order ?? 0 : 0}`}
                  {...rowData}
                  className="flex flex-wrap items-baseline gap-x-1 border-t border-line py-1 text-ui-2xs leading-[1.4]"
                >
                  <span className="shrink-0 font-semibold tabular-nums text-ink-muted">{index + 1}.</span>
                  {work.date && <span className="text-ink-faint">{work.date}</span>}
                  <span className={cn('font-semibold', work.workCode ? 'text-ink' : 'text-ink-faint')}>
                    {work.workName}
                  </span>
                  {showRole && 'role' in work && work.role && (
                    <span className={workRoleClass(work.role)}>{work.role}</span>
                  )}
                  {work.company && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-semibold',
                        companyText(work.company),
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                          companyDot(work.company),
                        )}
                      />
                      {work.company}
                    </span>
                  )}
                </span>
              ))}
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

/** 知名度 / 公关 这种整数；读不到就留个破折号，不要 NaN。 */
function countText(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : '未读出';
}

function tabClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-t border-b-2 px-3 py-1.5 text-ui-xs transition-colors',
    active
      ? 'border-brand bg-surface font-bold text-brand-strong'
      : 'border-transparent text-ink-muted hover:text-brand-strong',
  );
}

/** 两档提醒（玩家口径）：余量 ≤ 5 天算逾期风险，排不下才是违约。
 *  其余情况不出提示，风险列只留一条横杠。 */
const RISK_LABEL: Record<string, string> = {
  ok: '—',
  tight: '逾期风险',
  late: '违约提醒',
  unknown: '—',
};

const STATUS_LABEL: Record<string, string> = {
  shooting: '拍摄中',
  pending: '待开拍',
  done: '已完成',
};

/** 自制通告的档期状态：跟拍摄中同一套口径，只是这几条通告从没进过
 *  CaseFirm，状态只能由块里的「开拍日 → 杀青日」推。 */
const SELF_MADE_STATUS_LABEL: Record<SelfMadeStatus, string> = {
  shooting: '拍摄中',
  pending: '未开拍',
  done: '已完成',
  overdue: '已逾期',
  unknown: '无档期',
};

const SELF_MADE_STATUS_ORDER: SelfMadeStatus[] = ['shooting', 'overdue', 'pending', 'done', 'unknown'];

/** 1,550 万 / 5,000：存档酬劳原值就是元，过万折成万更好读。 */
function payText(pay: number): string {
  if (!pay) return '—';
  if (pay >= 10000) {
    const wan = pay / 10000;
    return `${Number.isInteger(wan) ? wan : wan.toFixed(1)} 万`;
  }
  return pay.toLocaleString('zh-CN');
}

/** 本页小结：右侧固定小导航（同「六大通告」右侧跳转栏的样式），列出存档解析页的
 *  各个标题卡片，点一下平滑跳过去，滚动时高亮当前所在卡片。仅在较宽屏幕
 *  （≥1120px）以右侧 sticky 小栏出现，窄屏隐藏以免挤压卡片宽度。 */
function CaseToc({
  result,
  signedArtists,
  activeGroups,
}: {
  result: ParseResult;
  signedArtists: SignedArtist[];
  activeGroups: GroupRecord[];
}) {
  const [active, setActive] = useState('');
  // 右栏高度优先给「艺人速查」：本页小结默认收成一行，要用再展开。
  const [collapsed, setCollapsed] = useState(true);

  const entries = useMemo(() => {
    const list: { id: string; label: string; selector: string; summary: string }[] = [];
    if (result.company) {
      list.push({
        id: 'company',
        label: '公司',
        selector: '[data-case-company]',
        summary: `主角 ${result.company.protagonist || '未记录'}`,
      });
    }
    list.push({
      id: 'artists',
      label: '我方艺人',
      selector: '[data-case-artists]',
      summary: `${signedArtists.length} 位`,
    });
    list.push({
      id: 'groups',
      label: '我方团体',
      selector: '[data-case-groups]',
      summary: `${activeGroups.length} 个`,
    });
    if (result.items.length > 0) {
      list.push({
        id: 'items',
        label: '道具',
        selector: '[data-case-items]',
        summary: `${result.items.filter((it) => it.quantity > 0).length} 件`,
      });
    }
    if (result.scenes.length > 0) {
      list.push({
        id: 'scenes',
        label: '场景',
        selector: '[data-case-scenes]',
        summary: `${result.scenes.filter((s) => s.unlocked).length}/${result.scenes.length} 解锁`,
      });
    }
    list.push({
      id: 'updates',
      label: '开放节奏',
      selector: '[data-case-updates]',
      summary: `归并 ${result.batches.length} 批`,
    });
    list.push({
      id: 'notices',
      label: '通告',
      selector: '[data-case-tabs]',
      summary: `${result.notices.length} 筹备 / ${result.shooting.length} 拍摄`,
    });
    return list;
  }, [result, signedArtists.length, activeGroups.length]);

  // 滚动时高亮当前所处的卡片（取视口内最靠上的那个）。
  // root 必须是真正滚动的内容列（data-case-scroll），不是外层的 fixed 容器。
  useEffect(() => {
    const root = document.querySelector('[data-case-scroll]');
    const observer = new IntersectionObserver(
      (obs) => {
        const visible = obs
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).getAttribute('data-case-toc-id');
          if (id) setActive(id);
        }
      },
      { root: root as Element | null, rootMargin: '-80px 0px -55% 0px', threshold: 0 },
    );
    entries.forEach((e) => {
      const t = document.querySelector(e.selector);
      if (t) {
        t.setAttribute('data-case-toc-id', e.id);
        observer.observe(t);
      }
    });
    return () => observer.disconnect();
  }, [entries]);

  const jump = (entry: { id: string; selector: string }) => {
    const el = document.querySelector(entry.selector) as HTMLElement | null;
    if (!el) return;
    // 目标若是收起的 details，先展开再滚，免得跳过去只看到标题。
    if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(entry.id);
  };

  return (
    <nav
      data-case-toc
      aria-label="本页小结"
      className="rounded-ui-md border border-line bg-surface p-2.5 shadow-soft"
    >
      <div className="flex items-center justify-between px-0.5">
        <span className="text-ui-2xs font-semibold text-ink-faint">本页小结</span>
        <button
          type="button"
          data-case-toc-toggle
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
          className="rounded px-1 text-ui-2xs text-ink-faint transition-colors hover:bg-surface-soft hover:text-brand-strong"
        >
          {collapsed ? '展开' : '收起'}
        </button>
      </div>
      {!collapsed && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                data-case-toc-link={e.id}
                aria-current={active === e.id ? 'true' : undefined}
                onClick={() => jump(e)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-ui-xs px-2 py-1.5 text-left text-ui-2xs transition-colors',
                  active === e.id
                    ? 'bg-brand-soft font-semibold text-brand-strong'
                    : 'text-ink-muted hover:bg-surface-soft hover:text-brand-strong',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    active === e.id ? 'bg-brand' : 'bg-line-strong',
                  )}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{e.label}</span>
                <span className={cn('shrink-0 tabular-nums', active === e.id ? 'text-brand-strong' : 'text-ink-faint')}>
                  {e.summary}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

/** 右栏太窄，横滑小块上只写月/日；完整日期（含年份）留在悬停提示里。 */
function shortNoticeDate(date: string): string {
  const parts = date.split('/');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : (date || '—');
}

/** 每位艺人名下的横滑条：左右箭头按一格滚动，轨道自身保留横向滚动条。
 *  只有一条通告时箭头禁用，不会假装能滑。 */
function ActiveNoticeStrip({ notices }: { notices: ActiveArtistNotice[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    updateEdges();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      observer.disconnect();
    };
  }, [updateEdges, notices]);

  const step = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const tile = el.querySelector('[data-case-quickref-notice]') as HTMLElement | null;
    // gap-1.5 = 6px；量真实卡片宽度，别把箭头步长写死。
    el.scrollBy({ left: direction * ((tile?.offsetWidth ?? 148) + 6), behavior: 'smooth' });
  };

  return (
    <div className="mt-1.5 border-t border-line pt-1" data-case-quickref-notice-strip>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-ui-2xs font-semibold text-ink-faint">
          在拍通告 <span className="tabular-nums">{notices.length}</span>
        </span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            data-case-quickref-scroll-prev
            aria-label="向左滑动在拍通告"
            disabled={!edges.left}
            onClick={() => step(-1)}
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded border border-line bg-surface text-ui-2xs leading-none text-ink-muted transition-colors',
              edges.left ? 'hover:border-brand-line hover:text-brand-strong' : 'cursor-not-allowed opacity-40',
            )}
          >
            ‹
          </button>
          <button
            type="button"
            data-case-quickref-scroll-next
            aria-label="向右滑动在拍通告"
            disabled={!edges.right}
            onClick={() => step(1)}
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded border border-line bg-surface text-ui-2xs leading-none text-ink-muted transition-colors',
              edges.right ? 'hover:border-brand-line hover:text-brand-strong' : 'cursor-not-allowed opacity-40',
            )}
          >
            ›
          </button>
        </span>
      </div>
      <div
        ref={scrollRef}
        data-case-quickref-notice-scroll
        className="case-active-notice-scroll flex gap-1.5 overflow-x-auto pb-1.5"
      >
        {notices.map((item) => (
          <div
            key={item.key}
            data-case-quickref-notice={item.code}
            data-case-quickref-notice-source={item.source}
            data-case-quickref-notice-risk={item.risk}
            title={`${item.name}（${item.code}）${item.groupName ? ` · ${item.groupName}` : ''}\n${item.startDate || '—'} ~ ${item.endDate || '—'}`}
            className={cn(
              'relative w-[148px] shrink-0 rounded border border-line border-l-[3px] px-1.5 py-1',
              ACTIVE_NOTICE_TILE_CLASS[item.category] ?? 'bg-surface',
            )}
          >
            <div className="flex items-center gap-1 pr-2">
              <span className={cn(
                'shrink-0 rounded px-1 text-ui-2xs',
                CATEGORY_CLASS[item.category] ?? 'bg-surface text-ink-muted',
              )}
              >
                {item.category}
              </span>
              <span className="min-w-0 flex-1 truncate text-ui-2xs font-semibold text-ink">
                {item.name}
              </span>
            </div>
            <div className="mt-0.5 tabular-nums text-ui-2xs text-ink-muted">
              {shortNoticeDate(item.startDate)} ~ {shortNoticeDate(item.endDate)}
            </div>
            <div className={cn(
              'tabular-nums text-ui-2xs text-ink-faint',
              item.risk === 'tight' || item.risk === 'late' ? 'pr-3' : '',
            )}
            >
              {item.groupName && <span className="mr-0.5">团 </span>}
              {item.doneDays} / {item.workDays || '—'} 天
              {item.risk === 'tight' && <span className="ml-1 font-semibold text-gold">逾期</span>}
              {item.risk === 'late' && <span className="ml-1 font-semibold text-alert">违约</span>}
            </div>
            {(item.risk === 'tight' || item.risk === 'late') && (
              <span
                aria-hidden
                className={cn(
                  'absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white',
                  item.risk === 'late' ? 'bg-alert' : 'bg-gold',
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 右栏「艺人速查」：顶部完整卡片不动，这里只留对照通告表格时一眼要扫的
 *  九项属性 + 状态 + 社交三项 + 当前在拍通告；友好度、压力疲劳、通告统计
 *  仍在顶部卡片里。列表在剩余高度内自己滚，本页小结钉在上方不受影响。 */
function ArtistQuickRef({
  signed, activeNotices,
}: {
  signed: SignedArtist[];
  activeNotices: Map<number, ActiveArtistNotice[]>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section data-case-quickref className="flex min-h-0 flex-1 flex-col rounded-ui-md border border-line bg-surface p-2.5 shadow-soft">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-ui-2xs font-semibold text-ink-faint">艺人速查 · {signed.length} 位</span>
        <button
          type="button"
          data-case-quickref-toggle
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
          className="rounded px-1 text-ui-2xs text-ink-faint transition-colors hover:bg-surface-soft hover:text-brand-strong"
        >
          {collapsed ? '展开' : '收起'}
        </button>
      </div>
      {!collapsed && (
        <div data-case-quickref-list className="mt-1.5 min-h-0 space-y-1.5 overflow-y-auto pr-0.5">
          {signed.length === 0 ? (
            <p className="px-0.5 text-ui-2xs text-ink-faint">这份存档里没有识别到旗下艺人。</p>
          ) : signed.map(({ option, artist }) => {
            const active = activeNotices.get(option.id) ?? [];
            return (
              <div key={option.id} data-case-quickref-artist={option.name} className="rounded border border-line bg-surface-soft px-2 py-1.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-ui-2xs font-bold text-brand-strong">#{option.id} {option.name}</span>
                  <span className="rounded-full bg-surface px-1 text-ui-2xs text-ink-faint">
                    {option.gender === 'female' ? '女' : '男'}
                  </span>
                  <span
                    data-case-quickref-condition
                    className={cn(
                      'ml-auto text-ui-2xs',
                      artist?.condition && artist.condition !== '正常'
                        ? 'font-semibold text-alert' : 'text-ink-faint',
                    )}
                  >
                    {artist?.condition ?? '—'}
                  </span>
                </div>
                {artist ? (
                  <>
                    <div data-case-quickref-attrs className="mt-1 grid grid-cols-3 gap-x-1.5 gap-y-0.5 text-ui-2xs text-ink-muted">
                      {ATTRS.map((attr, i) => (
                        <span key={attr} className="flex justify-between gap-0.5 whitespace-nowrap">
                          <span className="text-ink-faint">{attr}</span>
                          <b className="tabular-nums">{artist.abilities[i]}</b>
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 whitespace-nowrap border-t border-line pt-1 text-ui-2xs leading-[1.5] text-ink-faint">
                      叛逆 {artist.social[0]} · 性感 {artist.social[1]} · 亲和 {artist.social[2]}
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-ui-2xs text-ink-faint">这份存档里还没有这位的状态块。</p>
                )}
                {active.length > 0 && <ActiveNoticeStrip notices={active} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** 桌面端从磁盘读来的存档：buffer 每次读取都是新快照，token 变化时重新解析。
 *  Web 端不传这个 prop，仍走拖入 / 选择文件的路径。 */
export interface ExternalSave {
  buffer: ArrayBuffer;
  name: string;
  token: number;
}

/** 存档解析：把 .sa2 拖进来，在浏览器里解出当期通告、日期与艺人数值。
 *  文件不会上传；读进内存的就是一份快照，游戏随后覆盖自动存档也不影响。 */
export default function CaseReaderApp({ externalSave }: { externalSave?: ExternalSave | null } = {}) {
  const guide = useGuideContext();
  const sceneUnlockHints = useMemo(() => collectSceneUnlockHints(guide), [guide]);
  const [tables, setTables] = useState<CaseTables>(EMPTY_TABLES);
  const [tablesReady, setTablesReady] = useState(false);
  const [tablesError, setTablesError] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  /** 筹备中的接取筛选：全部 / 未预约 / 满足条件。 */
  const [takeFilter, setTakeFilter] = useState<'all' | 'slots' | 'qualified'>('all');
  /** 三个页签：等档期的筹备中、已经接下的拍摄中、自家出品的自制通告。 */
  const [board, setBoard] = useState<'open' | 'shooting' | 'selfMade'>('open');
  const inputRef = useRef<HTMLInputElement>(null);
  // A file can be dropped before the bundled tables finish loading. Keep the
  // freshest copies in refs so parseSave never joins against empty tables.
  const tablesRef = useRef(tables);
  tablesRef.current = tables;
  const lastBufferRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(TABLES_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CaseTables>;
      })
      .then((data) => {
        if (!alive) return;
        setTables(data);
        setTablesReady(true);
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        // Degraded mode: numbers still parse, names and grades stay blank.
        setTablesError(`内置通告表读取失败（${String(reason)}），名称与等级会留空，数值仍可解析。`);
        setTablesReady(true);
      });
    return () => { alive = false; };
  }, [TABLES_URL]);

  const parseBuffer = useCallback((buffer: ArrayBuffer, name: string) => {
    setResult(parseSave(buffer, tablesRef.current, name));
  }, []);

  const readFile = useCallback(async (file: File) => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      // Read once: Auto.sa2 can be overwritten by the running game at any time.
      const buffer = await file.arrayBuffer();
      lastBufferRef.current = buffer;
      await new Promise((resolve) => setTimeout(resolve, 0));
      parseBuffer(buffer, file.name);
    } catch (reason: unknown) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [parseBuffer]);

  // 桌面端：主进程读来的快照直接走同一条解析路径；token 递增表示又读了一次
  // （同一份存档被游戏覆盖后字节变了，也要重新解）。
  useEffect(() => {
    if (!externalSave || !tablesReady) return;
    lastBufferRef.current = externalSave.buffer;
    parseBuffer(externalSave.buffer, externalSave.name);
  }, [externalSave, tablesReady, parseBuffer]);

  const onPick = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
    event.target.value = '';
  }, [readFile]);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!tablesReady) {
      setError('内置通告表还没准备好，请稍等一下再拖入存档。');
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  }, [readFile, tablesReady]);

  const clear = useCallback(() => {
    setResult(null);
    setError('');
    setQuery('');
    setFilterCategory('all');
    setFilterCompany('all');
    setTakeFilter('all');
    lastBufferRef.current = null;
  }, []);

  const categories = useMemo<[string, number][]>(() => {
    if (!result) return [];
    const counts = new Map<string, number>();
    for (const notice of result.notices) {
      counts.set(notice.category, (counts.get(notice.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [result]);

  const companies = useMemo(() => {
    if (!result) return [];
    return [...new Set(result.notices.map((notice) => notice.company).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [result]);

  const artists = result?.artists ?? [];

  /** The panel is fixed: every artist the save marks as signed, no picker. */
  const signedArtists = useMemo<SignedArtist[]>(() => {
    if (!result) return [];
    return result.artistDirectory
      .filter((option) => option.signed)
      .map((option) => ({
        option,
        artist: option.artistIndex === null
          ? null
          : artists.find((a) => a.index === option.artistIndex) ?? null,
      }));
  }, [result, artists]);

  /** 公司层面的奖：年度专辑(24) / 年度戏剧(44)。存档挂在某人作品名下，
   *  公司行带上人名。最佳团体(23) 是团体荣誉，归到「我方团体」，不在这里。 */
  const companyAwards = useMemo(() => {
    if (!result) return [];
    const nameOf = (id: number): string =>
      result.artistDirectory.find((a) => a.id === id)?.name
      ?? tables.stars?.[String(id)]?.[0]
      ?? `编号${id}`;
    return result.awards
      .filter((award) => award.company && !award.group)
      .map((award) => ({ award, artistName: nameOf(award.artistId) }));
  }, [result, tables]);

  /** 团体奖（最佳团体）：按存档里挂名的艺人编号归到其所在的团体。
   *  一个艺人可以是多支团体的成员，此时每条奖在所属每支团体卡里都显示；
   *  挂名艺人不在任何团体里的奖归到 groupAwardsUnmatched，兜底不丢失。 */
  const { groupAwardsByTeam, groupAwardsUnmatched } = useMemo(() => {
    const byTeam = new Map<number, ParseResult['awards']>();
    const unmatched: ParseResult['awards'] = [];
    if (!result) return { groupAwardsByTeam: byTeam, groupAwardsUnmatched: unmatched };
    const groupAwards = result.awards.filter((award) => award.group);
    for (const award of groupAwards) {
      const teams = result.teams.filter((team) => team.memberIds.includes(award.artistId));
      if (teams.length === 0) {
        unmatched.push(award);
        continue;
      }
      for (const team of teams) {
        const list = byTeam.get(team.code) ?? [];
        list.push(award);
        byTeam.set(team.code, list);
      }
    }
    return { groupAwardsByTeam: byTeam, groupAwardsUnmatched: unmatched };
  }, [result]);

  /** 团体唱片发行清单：按记事挂名艺人归到其所在团体。 */
  const groupWorksByTeam = useMemo(() => {
    const byTeam = new Map<number, ParseResult['groupWorks']>();
    if (!result) return byTeam;
    for (const work of result.groupWorks) {
      const teams = result.teams.filter((team) => team.memberIds.includes(work.artistId));
      for (const team of teams) {
        const list = byTeam.get(team.code) ?? [];
        list.push(work);
        byTeam.set(team.code, list);
      }
    }
    return byTeam;
  }, [result]);

  /** 团体演唱会：只把记事里标记为团体场的记录挂到成员所在团体，个人场不串到团体卡。 */
  const groupEventsByTeam = useMemo(() => {
    const byTeam = new Map<number, ArtistEvent[]>();
    if (!result) return byTeam;
    for (const event of result.events.filter((item) => item.group)) {
      for (const team of result.teams.filter((item) => item.memberIds.includes(event.artistId))) {
        const list = byTeam.get(team.code) ?? [];
        list.push(event);
        byTeam.set(team.code, list);
      }
    }
    return byTeam;
  }, [result]);

  /** 艺人作品清单：按记事挂名艺人分组，供五个分类和「作品总数」悬停。 */
  const worksByArtist = useMemo(() => {
    const byArtist = new Map<number, WorkRecord[]>();
    if (!result) return byArtist;
    for (const work of result.works) {
      const list = byArtist.get(work.artistId) ?? [];
      list.push(work);
      byArtist.set(work.artistId, list);
    }
    return byArtist;
  }, [result]);

  /** 我方团体：只认存档 `Team` 段里的记录（编号 101 起）。存档没记录就是
   *  旗下没有团体 —— 这里不做任何猜测，也不预置默认值。 */
  const activeGroups = useMemo<GroupRecord[]>(() => {
    if (!result) return [];
    const nameOf = (id: number): string =>
      ARTIST_DIRECTORY.find((a) => a.id === id)?.name
      ?? tables.stars?.[String(id)]?.[0]
      ?? `编号${id}`;
    return result.teams.map((team) => buildGroupRecord(team, nameOf));
  }, [result, tables]);

  /** 右栏「艺人速查」里每位名下挂的在拍块：团体通告按成员展开，自制通告
   *  只取状态为拍摄中的那一条，风险两档与表格里同一套数字。 */
  const activeNotices = useMemo(
    () => result
      ? buildActiveArtistNotices(result, signedArtists, activeGroups)
      : new Map<number, ActiveArtistNotice[]>(),
    [result, signedArtists, activeGroups],
  );

  /** 我方接不接得上这个角色：性别要对上，九项数值一项都不能差。
   *  团体通告拿队长去比 —— 与右边「数值对比」列同一套判断，不能两处给出不同答案。 */
  const fitsRole = useCallback((role: RoleRecord) => {
    if (isGroupRole(role) && activeGroups.length > 0) {
      return activeGroups.some((group) => {
        const leader = artists.find((a) => a.roleId === group.leaderId) ?? null;
        return matchGroupRole(role, leader, group.name, group.leaderName).canAccept;
      });
    }
    return signedArtists.some((item) => item.artist
      && matchRole(role, item.artist, item.option.name, item.option.gender).canAccept);
  }, [activeGroups, artists, signedArtists]);

  /** 两个接取标签的数字只按存档本身算，不受搜索 / 类别 / 公司影响。 */
  const slotCount = useMemo(
    () => (result ? result.notices.filter(isAcceptable).length : 0),
    [result],
  );
  const qualifiedCount = useMemo(
    () => (result ? result.notices.filter((notice) => canTakeNotice(notice, fitsRole)).length : 0),
    [result, fitsRole],
  );

  /** Search, category, company and 接取情况 are independent filters; they intersect. */
  /** 存档已有道具按属性反查， hover 差值时和训练 / 打工一起给。 */
  const itemHints = useMemo(() => itemHintsFor(result?.items ?? []), [result]);

  /** 特殊物品里的学院结业证书，按道具说明挂到对应艺人名下。 */
  const certificates = useMemo(
    () => (result ? artistCertificates(result.items, tables) : new Map<number, string[]>()),
    [result, tables],
  );

  const notices = useMemo(() => {
    if (!result) return [];
    const needle = query.trim().toLowerCase();
    return result.notices.filter((notice) => {
      if (takeFilter === 'slots' && !isAcceptable(notice)) return false;
      if (takeFilter === 'qualified' && !canTakeNotice(notice, fitsRole)) return false;
      if (filterCategory !== 'all' && notice.category !== filterCategory) return false;
      if (filterCompany !== 'all' && notice.company !== filterCompany) return false;
      if (!needle) return true;
      return [
        notice.code, notice.name, notice.category, notice.type, notice.company,
        ...notice.roles.map((role) => role.role),
      ].some((text) => text.toLowerCase().includes(needle));
    });
  }, [result, query, filterCategory, filterCompany, takeFilter, fitsRole]);

  const filterDirty = query.trim() !== '' || filterCategory !== 'all'
    || filterCompany !== 'all' || takeFilter !== 'all';
  const resetFilters = useCallback(() => {
    setQuery('');
    setFilterCategory('all');
    setFilterCompany('all');
    setTakeFilter('all');
  }, []);

  const requirementCount = result
    ? result.notices.reduce((sum, n) => sum + n.roles.reduce((s, r) => s + r.requirements.length, 0), 0)
    : 0;
  const closingCount = result?.notices.filter((n) => n.status === 'closing').length ?? 0;

  const exportCsv = useCallback(() => {
    if (!result) return;
    const blob = new Blob([toCsv(result)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.saveName.replace(/\.[^.]+$/, '')}_当期通告数值.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <div
      data-case-reader
      data-case-dropzone
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'fixed inset-x-0 bottom-0 top-16 z-50 overflow-hidden bg-canvas',
        dragging && 'ring-2 ring-inset ring-brand',
      )}
    >
      {/* 内容列占满整屏滚动（滚动条自然落在视口最右）；
          本页小结 fixed 钉在视口右侧，内容用右侧 padding 让出目录宽度，互不遮挡。
          内容内部再限制 max-w，阅读宽度不过长。 */}
      <div
        data-case-scroll
        data-case-content
        className="absolute inset-0 overflow-y-auto px-8 pt-3 pb-10 nav:px-5 min-[1120px]:pr-[288px]"
      >
        <div className="mx-auto w-full max-w-[1600px]">
        {/* One compact toolbar: no page-level title, and the upload control
            must not push the content down. */}
        <div
          data-case-toolbar
          data-tables-source={tables.source}
          className="flex flex-wrap items-center gap-2 rounded-ui-md border border-line bg-surface px-3 py-2"
        >
          <button
            type="button"
            disabled={!tablesReady}
            onClick={() => inputRef.current?.click()}
            className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-ui-2xs font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {!tablesReady ? '准备中…' : result ? '换一个存档' : '选择存档'}
          </button>
          <input
            ref={inputRef}
            data-case-upload
            type="file"
            accept=".sa2,.sav,.SA2,.SAV"
            className="hidden"
            onChange={onPick}
            aria-label="选择明星志愿3 存档文件"
          />
          {!result && (
            <span className="text-ui-2xs text-ink-faint">
              把明星志愿3游戏存档拖到这里，或点上面的按钮选择。
            </span>
          )}
          {result && (
            <>
              <span className="max-w-[180px] truncate text-ui-2xs text-ink-faint" title={result.saveName}>
                {result.saveName}
              </span>
              <button
                type="button"
                onClick={clear}
                className="shrink-0 rounded-full border border-line px-2.5 py-1.5 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
              >
                清空
              </button>
            </>
          )}
          <span className="ml-auto flex items-center gap-2">
            {result && (
              <span data-case-count className="whitespace-nowrap text-ui-2xs text-ink-faint">
                {result.notices.length} 条 · {requirementCount} 项数值
              </span>
            )}
            {result && (
              <button
                type="button"
                onClick={exportCsv}
                className="shrink-0 rounded-full border border-line px-2.5 py-1.5 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
              >
                导出 CSV
              </button>
            )}
          </span>
        </div>

        {busy && <p className="mt-2 text-ui-2xs text-ink-muted">正在解析存档…</p>}
        {tablesError && (
          <p className="mt-2 rounded-ui-md border border-alert-line bg-alert-soft px-3 py-2 text-ui-2xs text-alert">
            {tablesError}
          </p>
        )}
        {error && !busy && (
          <div data-case-error className="mt-2 rounded-ui-md border border-alert-line bg-alert-soft px-4 py-2.5">
            <span className="text-ui-xs font-semibold text-alert">没能读出这份存档：</span>
            <span className="text-ui-2xs text-ink-muted">{error}</span>
            <span className="ml-2 text-ui-2xs text-ink-faint">请确认是明星志愿3 繁中三合一的 .sa2；甜蜜乐章格式不同，暂不支持。</span>
          </div>
        )}

        {result && !busy && (
          <>
            {/* Game clock, deadline warning and the next company refresh. */}
            <div data-case-clock className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ui-md border border-line bg-surface px-3 py-2 text-ui-2xs">
              <span className="font-semibold text-ink-muted">游戏时间</span>
              <span data-case-now className="rounded-full bg-brand px-2 py-0.5 font-bold text-white">
                {result.currentDate?.text ?? '未读到'} {result.currentDate?.label ?? ''}
              </span>
              <span className="text-ink-faint">|</span>
              <span className={cn('font-semibold', closingCount ? 'text-alert' : 'text-ink-muted')} data-case-closing>
                7 天内停止接取 {closingCount} 条
              </span>
              <span className="text-ink-faint">|</span>
              {result.nextUpdate ? (
                <span className="text-ink-muted" data-case-next-update>
                  下次更新 <b className="text-brand-strong">{result.nextUpdate.date} {result.nextUpdate.label}</b>
                  （{result.nextUpdate.daysAway > 0 ? `${result.nextUpdate.daysAway} 天后` : '今天'}）：
                  {result.nextUpdate.companies.join(' / ') || '制作公司未记录'}
                  <span className="ml-1 text-ink-faint">· {result.nextUpdate.codes.length} 条{result.nextUpdate.kinds.join('、')}</span>
                </span>
              ) : (
                <span className="text-ink-faint">存档里没有更晚一批的通告</span>
              )}
            </div>

            {/* 公司：名称与主角在存档头，形象 / 知名度 / 公关在 Firm 段。 */}
            {result.company && (
              <details data-case-company data-case-toc-target open className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5">
                <summary data-case-company-summary className="cursor-pointer text-ui-xs font-bold text-brand-strong">
                  公司 · {result.company.name || '名称未记录'}
                  <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                    主角 {result.company.protagonist || '未记录'}
                  </span>
                </summary>
                <div data-case-company-stats className="mt-2 grid grid-cols-4 gap-2 phone:grid-cols-2">
                  <CompanyStat
                    label="公司形象"
                    value={result.company.image || '未读出'}
                    attr="image"
                  />
                  <CompanyStat label="知名度" value={countText(result.company.fame)} attr="fame" />
                  <CompanyStat label="公关" value={countText(result.company.pr)} attr="pr" />
                  <CompanyStat
                    label="资金"
                    value={moneyText(result.company.money)}
                    hint={Number.isFinite(result.company.money)
                      ? `¥${result.company.money.toLocaleString('en-US')}`
                      : undefined}
                    attr="money"
                    alert={result.company.money < 0}
                  />
                </div>
                {/* 公司奖：年度专辑 / 最佳团体 / 年度戏剧，只有这几项挂在公司头上，
                    个人奖在下面每位艺人卡里。 */}
                <div
                  data-case-company-awards
                  className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 text-ui-2xs"
                >
                  <span className="text-ink-faint">奖项</span>
                  {companyAwards.length === 0 ? (
                    <span className="text-ink-faint">—</span>
                  ) : companyAwards.map(({ award, artistName }) => (
                    <span key={`${award.awardId}-${award.date}-${award.workCode}`} data-case-company-award data-case-award-id={award.awardId}>
                      <span className="award-item font-semibold text-title-star">{award.ceremony}·{award.label}</span>
                      <span className="award-meta ml-1 font-normal text-ink-faint">{award.workName}</span>
                      <span className="ml-1 font-normal text-ink-faint">{artistName} · {award.date}</span>
                    </span>
                  ))}
                </div>
              </details>
            )}

            {/* Fixed roster panel: every signed artist, collapsible like the
                company refresh timeline below. */}
            <details data-case-artists data-case-toc-target open className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5">
              <summary data-case-artists-summary className="cursor-pointer text-ui-xs font-bold text-brand-strong">
                我方艺人 · {signedArtists.length} 位
                <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                  {signedArtists.map((item) => item.option.name).join(' / ')}
                </span>
              </summary>
              <div
                data-case-artist-grid
                className="mt-2 flex flex-wrap gap-2"
              >
                {signedArtists.length === 0 ? (
                  <p className="text-ui-2xs text-ink-faint">这份存档里没有识别到旗下艺人。</p>
                ) : signedArtists.map(({ option, artist }) => (
                  <div key={option.id} className="w-[344px] shrink-0">
                    <ArtistCard
                      option={option}
                      artist={artist}
                      works={worksByArtist.get(option.id) ?? []}
                      certificates={certificates.get(option.id) ?? []}
                    />
                  </div>
                ))}
              </div>
            </details>

            {/* 我方团体：编号 101 起直接从存档读，存档没有就是旗下没有团体。 */}
            <details data-case-groups data-case-toc-target open className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5">
              <summary data-case-groups-summary className="cursor-pointer text-ui-xs font-bold text-brand-strong">
                我方团体 · {activeGroups.length} 个
                <span className="ml-2 font-normal text-ui-2xs text-ink-faint">名称与成员从存档读取</span>
              </summary>
              {activeGroups.length === 0 ? (
                <p data-case-groups-empty className="mt-2 text-ui-2xs text-ink-faint">—</p>
              ) : (
                <div data-case-group-grid className="mt-2 flex flex-wrap gap-2">
                  {activeGroups.map((group) => (
                    <div
                      key={group.code}
                      data-case-group
                      data-case-group-code={group.code}
                      className="w-[340px] shrink-0 rounded-ui-md border border-line bg-surface px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ui-xs font-semibold text-ink">{group.name}</span>
                        <span className="rounded-full bg-brand px-2 py-0.5 text-ui-2xs font-semibold text-white">
                          团体编码 {group.code}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-ui-2xs text-ink-faint">成员</span>
                        {group.memberNames.length === 0 && (
                          <span className="text-ui-2xs text-ink-faint">存档未记录</span>
                        )}
                        {group.memberNames.map((name, idx) => (
                          <span
                            key={`${name}-${idx}`}
                            data-case-group-member
                            data-case-group-leader={idx === 0 ? name : undefined}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-ui-2xs',
                              idx === 0
                                ? 'border-brand bg-brand-soft font-semibold text-brand-strong'
                                : 'border-line bg-surface-soft text-ink-muted',
                            )}
                          >
                            {name}
                            {idx === 0 && <span className="text-[10px]">队长</span>}
                          </span>
                        ))}
                      </div>
                      {/* 团体通告统计：团体只接唱片通告，直接读存档累计的唱片作品数。 */}
                      <div data-case-group-counts className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 text-ui-2xs">
                        <span className="text-ink-faint">通告统计</span>
                        <WorkCountChip
                          group
                          dataName="data-case-group-work-count"
                          label={NOTICE_COUNT_LABELS[2]}
                          value={group.workCount}
                          unit={NOTICE_COUNT_UNITS[2]}
                          works={groupWorksByTeam.get(group.code) ?? []}
                          title="团体唱片作品"
                        />
                      </div>
                      {/* 团体奖（最佳团体）：存档挂在队长 / 团员名下，归到团体卡；
                          不进任何艺人卡。 */}
                      {(groupAwardsByTeam.get(group.code)?.length ?? 0) > 0 && (
                        <div data-case-group-awards className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 text-ui-2xs">
                          <span className="text-ink-faint">团体奖</span>
                          {groupAwardsByTeam.get(group.code)!.map((award) => (
                            <span key={`${award.awardId}-${award.date}-${award.workCode}`} data-case-group-award data-case-award-id={award.awardId}>
                              <span className="award-item font-semibold text-title-star">{award.ceremony}·{award.label}</span>
                              <span className="award-meta ml-1 font-normal text-ink-faint">{award.workName}</span>
                              <span className="ml-1 font-normal text-ink-faint">{award.date}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {(groupEventsByTeam.get(group.code)?.length ?? 0) > 0 && (
                        <div data-case-group-events className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 text-ui-2xs">
                          <span className="text-ink-faint">活动</span>
                          {groupEventsByTeam.get(group.code)!.map((event) => (
                            <span
                              key={`${event.date}-${event.label}-${event.artistId}`}
                              data-case-group-event
                              className="rounded border border-brand-line bg-brand-soft px-1 font-semibold text-brand-strong"
                            >
                              {event.label}
                              <span className="ml-1 font-normal text-ink-muted">{event.date}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* 存档把团体奖挂在某位艺人名下，但该艺人不在任何团体记录里：
                  兜底展示，不丢奖，也不塞回艺人卡。 */}
              {groupAwardsUnmatched.length > 0 && (
                <div data-case-group-awards-unmatched className="mt-2 flex flex-wrap items-center gap-1 text-ui-2xs">
                  <span className="text-ink-faint">团体奖（存档未记所属团体）</span>
                  {groupAwardsUnmatched.map((award) => (
                    <span key={`${award.awardId}-${award.date}-${award.workCode}`} data-case-group-award data-case-award-id={award.awardId}>
                      <span className="award-item font-semibold text-title-star">{award.ceremony}·{award.label}</span>
                      <span className="award-meta ml-1 font-normal text-ink-faint">{award.workName}</span>
                      <span className="ml-1 font-normal text-ink-faint">{award.date}</span>
                    </span>
                  ))}
                </div>
              )}
            </details>

            {/* 我拥有的道具：存档的道具清单块，默认收起。按类型分三个页签，
                每个页签内部再分页（每页 10 件）。名称 / 说明 / 类型来自烘焙
                的道具表（Item.dat）。数量 0 的不展示。 */}
            {result.items.length > 0 && (
              <details
                data-case-items
                data-case-toc-target
                className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5"
              >
                <summary
                  data-case-items-summary
                  className="cursor-pointer text-ui-xs font-bold text-brand-strong"
                >
                  道具
                  <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                    {result.items.filter((it) => it.quantity > 0).length} 件
                  </span>
                </summary>
                <ItemsPanel
                  items={result.items}
                  tableCount={Object.keys(tables.items).length}
                  signed={signedArtists}
                  gifts={tables.gifts ?? {}}
                  giftSlots={tables.giftSlots ?? {}}
                />
              </details>
            )}

            {/* 世界场景：存档里 8 个国际场景的解锁标志，来自「世界脈動」记事。
                1 = 已解锁，费用来自 World.tab（游戏里显示的出国价格）。 */}
            {result.scenes.length > 0 && (
              <details
                data-case-scenes
                data-case-toc-target
                className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5"
              >
                <summary
                  data-case-scenes-summary
                  className="cursor-pointer text-ui-xs font-bold text-brand-strong"
                >
                  场景
                  <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                    {result.scenes.filter((s) => s.unlocked).length}/{result.scenes.length} 已解锁
                  </span>
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {result.scenes.map((scene, index) => {
                    const hints = sceneUnlockHints[scene.name] ?? [];
                    const showHints = hints.length > 0;
                    return (
                      <div
                        key={scene.name}
                        data-case-scene
                        data-case-scene-unlocked={scene.unlocked}
                        tabIndex={showHints ? 0 : undefined}
                        className={cn(
                          'group relative flex items-baseline justify-between rounded border px-2 py-1 text-ui-2xs',
                          scene.unlocked
                            ? 'border-growth-line bg-growth-soft text-growth-strong'
                            : 'border-line bg-surface text-ink-faint',
                          showHints && 'cursor-help outline-none focus-visible:ring-2 focus-visible:ring-brand-line',
                        )}
                      >
                        <b className="font-semibold">{scene.name}</b>
                        <span className={cn('ml-1 tabular-nums', showHints && 'decoration-dotted underline-offset-2 hover:underline')}>
                          {scene.unlocked ? '已解锁' : scene.cost.toLocaleString('zh-CN')}
                        </span>
                        {showHints && (
                          <span
                            data-case-scene-unlock
                            role="tooltip"
                            className={cn(
                              'pointer-events-none absolute top-full z-30 w-[320px] pt-1 opacity-0 transition-opacity duration-150',
                              'group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
                              sceneTooltipAlign(index),
                            )}
                          >
                            <span className="block rounded-ui-sm border border-line bg-surface p-2 text-left shadow-lg">
                              <span className="mb-1 block text-ui-2xs font-semibold text-brand-strong">
                                解锁方式 · {scene.name}
                              </span>
                              <span
                                data-case-scene-unlock-scroll
                                className="block max-h-[240px] overflow-y-auto overscroll-contain pr-1"
                              >
                                {hints.map((line, lineIndex) => (
                                  <span
                                    key={`${lineIndex}-${line}`}
                                    data-case-scene-unlock-line
                                    className={cn(
                                      'block text-ui-2xs leading-[1.5] text-ink-muted',
                                      lineIndex > 0 && 'mt-1 border-t border-line pt-1',
                                    )}
                                  >
                                    {line}
                                  </span>
                                ))}
                              </span>
                            </span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}

            {/* 各公司开放节奏：只按上面列出的通告归并，历史批次不进这里。 */}
            <details data-case-updates data-case-toc-target className="mt-2 rounded-ui-md border border-line bg-surface px-3 py-2 text-ui-2xs">
              <summary className="cursor-pointer font-semibold text-brand-strong">
                各公司开放节奏 · 按下面通告的接取日归并 {result.batches.length} 批
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.batches.map((batch) => (
                  <span
                    key={batch.date}
                    className={cn(
                      'rounded border px-2 py-1 leading-[1.5]',
                      batch.daysAway > 0
                        ? 'border-brand-line bg-brand-soft text-ink-muted'
                        : 'border-line bg-surface-soft text-ink-faint',
                    )}
                  >
                    <b className="text-ink-muted">{batch.date} {batch.label}</b>
                    <span className="ml-1 text-ink-faint">
                      {batch.daysAway > 0 ? `${batch.daysAway} 天后` : batch.daysAway === 0 ? '今天' : '已开放'}
                    </span>
                    <br />
                    <span>{batch.companies.join(' / ') || '公司未记录'}</span>
                    <span className="ml-1 text-ink-faint">· {batch.codes.length} 条</span>
                  </span>
                ))}
              </div>
            </details>
          </>
        )}

        {result && !busy && (
          result.notices.length === 0 && result.shooting.length === 0
            && result.selfMade.length === 0 ? (
            <div className="mt-2">
              <EmptyState title="这份存档里没有当期通告" text="CaseFirm 段没有登记任何通告编号。换一份游戏进行中的存档再试。" />
            </div>
          ) : (
            <>
              <div data-case-tabs data-case-toc-target className="mt-2 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="通告状态">
                <button
                  type="button"
                  role="tab"
                  data-case-tab="open"
                  aria-selected={board === 'open'}
                  onClick={() => setBoard('open')}
                  className={tabClass(board === 'open')}
                >
                  筹备中 <span className="tabular-nums">{result.notices.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  data-case-tab="shooting"
                  aria-selected={board === 'shooting'}
                  onClick={() => setBoard('shooting')}
                  className={tabClass(board === 'shooting')}
                >
                  拍摄中 <span className="tabular-nums">{result.shooting.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  data-case-tab="self-made"
                  aria-selected={board === 'selfMade'}
                  onClick={() => setBoard('selfMade')}
                  className={tabClass(board === 'selfMade')}
                >
                  自制通告及其他 <span className="tabular-nums">{result.selfMade.length}</span>
                </button>
              </div>
              {board === 'selfMade' ? (
                <SelfMadePanel
                  notices={result.selfMade}
                  emptyTitle="还没有自制通告"
                  emptyText="这份存档的 CaseCreate 段里没有自制通告。自己制作唱片或戏剧之后再读一次。"
                />
              ) : board === 'shooting' ? (
                <ShootingPanel
                  notices={result.shooting}
                  emptyTitle="没有在拍的通告"
                  emptyText="这份存档里没有旗下艺人正在赶期的通告。"
                />
              ) : (
              <>
              {/* Search + type/company filters sit directly above the notice
                  table, following the same intersection logic as 通告库. */}
              <div data-case-filters className="mt-2 rounded-ui-md border border-line bg-surface px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-ui-md border border-line bg-surface-soft px-3 py-1.5 transition-colors focus-within:border-brand-line">
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-ink-faint"
                    >
                      <circle cx="7" cy="7" r="4.5" />
                      <path d="M10.5 10.5 14 14" strokeLinecap="round" />
                    </svg>
                    <input
                      type="text"
                      data-case-search
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); }}
                      placeholder="搜索通告名称、编号、类型、公司或角色"
                      aria-label="筛选通告"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent text-ui-xs text-ink outline-none placeholder:text-ink-faint"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="shrink-0 rounded-full px-2 py-0.5 text-ui-2xs text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand-strong"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <label className="flex shrink-0 items-center gap-1.5 rounded-ui-md border border-line bg-surface-soft px-2.5 py-1.5 text-ui-2xs text-ink-faint">
                    公司
                    <select
                      data-case-filter-company
                      value={filterCompany}
                      onChange={(event) => setFilterCompany(event.target.value)}
                      className="max-w-[150px] bg-transparent text-ui-2xs text-ink outline-none"
                      aria-label="按公司筛选"
                    >
                      <option value="all">全部</option>
                      {companies.map((company) => (
                        <option key={company} value={company}>{company}</option>
                      ))}
                    </select>
                  </label>
                  {/* 接取情况拆两档：未预约（还有角色没被预约）、满足条件
                      （未预约之外，我方还得有人性别与九项数值全达标）。 */}
                  <div
                    data-case-take-filter
                    role="group"
                    aria-label="按接取情况筛选"
                    className="flex shrink-0 items-center gap-1"
                  >
                    <button
                      type="button"
                      data-case-filter-slots
                      aria-pressed={takeFilter === 'slots'}
                      onClick={() => setTakeFilter((value) => (value === 'slots' ? 'all' : 'slots'))}
                      title="还有角色没被人预约，也还没停止接取 —— 我方数值够不够另说"
                      className={chipClass(takeFilter === 'slots')}
                    >
                      未预约
                      <span className={cn('tabular-nums', takeFilter === 'slots' ? 'text-white/80' : 'text-ink-faint')}>
                        {slotCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      data-case-filter-qualified
                      aria-pressed={takeFilter === 'qualified'}
                      onClick={() => setTakeFilter((value) => (value === 'qualified' ? 'all' : 'qualified'))}
                      title="还有角色没被预约，并且我方至少有一位艺人的性别、所需数值与社交门槛都达标"
                      className={chipClass(takeFilter === 'qualified')}
                    >
                      满足条件
                      <span className={cn('tabular-nums', takeFilter === 'qualified' ? 'text-white/80' : 'text-ink-faint')}>
                        {qualifiedCount}
                      </span>
                    </button>
                  </div>
                  {filterDirty && (
                    <button
                      type="button"
                      data-case-filter-reset
                      onClick={resetFilters}
                      className="shrink-0 rounded-ui-md border border-line bg-surface px-2.5 py-1.5 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
                    >
                      重置筛选
                    </button>
                  )}
                  <span data-case-filter-count className="ml-auto whitespace-nowrap text-ui-2xs tabular-nums text-ink-faint">
                    当前 {notices.length} / {result.notices.length} 条
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5" data-case-cats role="group" aria-label="按类型筛选">
                  <button
                    type="button"
                    data-case-cat="all"
                    aria-pressed={filterCategory === 'all'}
                    onClick={() => setFilterCategory('all')}
                    className={chipClass(filterCategory === 'all')}
                  >
                    全部 <span className="tabular-nums">{result.notices.length}</span>
                  </button>
                  {categories.map(([category, count]) => (
                    <button
                      key={category}
                      type="button"
                      data-case-cat={category}
                      aria-pressed={filterCategory === category}
                      onClick={() => setFilterCategory(filterCategory === category ? 'all' : category)}
                      className={chipClass(filterCategory === category)}
                    >
                      {category} <span className={cn('tabular-nums', filterCategory === category ? 'text-white/80' : 'text-ink-faint')}>{count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {notices.length === 0 ? (
                <div className="mt-2">
                  <EmptyState title="没有符合条件的通告" text="改一下筛选条件或清空搜索再试。" />
                </div>
              ) : (
                <div data-case-table className="mt-2 rounded-ui-md border border-line bg-surface">
                  <table className="w-full table-fixed border-collapse text-ui-xs">
                    <thead>
                      <tr className="bg-surface-soft text-left text-ui-2xs font-semibold text-ink-muted">
                        <Th className="w-[11%]">通告</Th>
                        <Th className="w-[7%]">类型</Th>
                        <Th className="w-[7%]">制作公司</Th>
                        <Th className="w-[10%]">接取时间</Th>
                        <Th className="w-[10%]">执行期间</Th>
                        <Th className="w-[10%]">角色 / 难度</Th>
                        <Th className="w-[14%]">所需数值</Th>
                        <Th className="w-[24%]" dataAttrs={{ 'data-case-match-col': 'yes' }}>数值对比</Th>
                        <Th className="w-[7%]">预约</Th>
                      </tr>
                    </thead>
                    {notices.map((notice) => (
                      <NoticeRows
                        key={`${notice.code}-${notice.firmSlot}`}
                        notice={notice}
                        signed={signedArtists}
                        groups={activeGroups}
                        artists={artists}
                        itemHints={itemHints}
                      />
                    ))}
                  </table>
                </div>
              )}
              </>
              )}
            </>
          )
        )}
        </div>
      </div>

      {result && (
        <aside className="fixed right-4 top-[76px] z-10 flex max-h-[calc(100vh-92px)] w-[248px] flex-col gap-2 hidden min-[1120px]:flex">
          <div className="shrink-0">
            <CaseToc
              result={result}
              signedArtists={signedArtists}
              activeGroups={activeGroups}
            />
          </div>
          <ArtistQuickRef signed={signedArtists} activeNotices={activeNotices} />
        </aside>
      )}
    </div>
  );
}

/** 大类是简体（由编号前缀推出），细分是游戏原文的繁体，
 *  比较前先把会重复的几个字归一，免得出现「电影 / 電影」两行。 */
const T2S: Record<string, string> = { 電: '电', 視: '视', 劇: '剧', 廣: '广' };
function normKind(text: string): string {
  return text.replace(/[電視劇廣]/g, (ch) => T2S[ch] ?? ch);
}

/** 角色 + 难度的小胶囊。筹备中 / 拍摄中 / 自制通告三张表统一用这一个，
 *  免得同一个「男主角 5★」在三处长得不一样。 */
function RolePill({ role, attr }: { role: RoleRecord; attr?: string }) {
  return (
    <span
      {...(attr ? { [attr]: role.roleCode } : {})}
      title={role.roleCode}
      className="inline-flex items-baseline gap-1 whitespace-nowrap rounded-full border border-line-strong bg-surface px-2 py-0.5 text-ui-2xs text-ink-muted"
    >
      {role.role}
      <b className="text-ui-2xs text-brand-strong">{role.star}★</b>
    </span>
  );
}

/** 类型列的第二行：细分类型，跟大类同名就不重复写。 */
function kindDetail(notice: { category: string; type: string; subtype: string }): string {
  if (notice.subtype && normKind(notice.subtype) !== normKind(notice.category)) return notice.subtype;
  if (notice.type && normKind(notice.type) !== normKind(notice.category)) return notice.type;
  return '';
}

/** 拍摄中：已经接下、还没杀青的通告。
 *
 *  一条通告上不同艺人各拿一个角色、各拍各的天数、各拿各的酬劳，所以一
 *  位艺人一行；通告信息只在第一行给（rowSpan），后面几行只写这位艺人自
 *  己的进度。表里只出现自己旗下的艺人 —— 同一部戏的对手公司演员不算进来。
 *  提醒只用存档里的数字算：
 *  还差几天（Length 表工作天数 - 存档完成天数）对比「剩下的日子里按每週
 *  上限还能排几天」，排不下 = 违约提醒，余量 ≤ 5 天 = 逾期风险。 */
function ShootingPanel({
  notices, emptyTitle, emptyText,
}: { notices: ShootingNotice[]; emptyTitle: string; emptyText: string }) {
  if (notices.length === 0) {
    return (
      <div className="mt-2">
        <EmptyState title={emptyTitle} text={emptyText} />
      </div>
    );
  }
  return (
    <div data-case-shooting className="mt-2 rounded-ui-md border border-line bg-surface">
      <table className="w-full table-fixed border-collapse text-ui-xs">
        <thead>
          <tr className="bg-surface-soft text-left text-ui-2xs font-semibold text-ink-muted">
            <Th className="w-[20%]">通告</Th>
            <Th className="w-[15%]">开拍 → 杀青</Th>
            <Th className="w-[13%]">角色 / 难度</Th>
            <Th className="w-[13%]">艺人</Th>
            <Th className="w-[11%]">完成 / 需拍</Th>
            <Th className="w-[12%]">剩余</Th>
            <Th className="w-[8%]">酬劳</Th>
            <Th className="w-[10%]">逾期风险</Th>
          </tr>
        </thead>
        <tbody>
          {notices.flatMap((notice) =>
            notice.casts.map((cast, index) => (
              <tr
                key={`${notice.code}-${cast.artistId}`}
                data-case-shooting-row={notice.code}
                data-case-shooting-risk={cast.risk}
                className={cn(
                  'align-top',
                  index === 0 ? 'border-t border-line' : '',
                  cast.risk === 'late'
                    ? 'border-l-[3px] border-l-alert bg-alert-soft/50'
                    : cast.risk === 'tight'
                      ? 'border-l-[3px] border-l-gold-line bg-gold-soft/40'
                      : 'border-l-[3px] border-l-transparent',
                )}
              >
                {index === 0 && (
                  <Td rowSpan={notice.casts.length} className="border-b border-line">
                    <span className="text-ui-xs font-semibold text-ink">{notice.name}</span>
                    <div className="mt-0.5 tabular-nums text-ui-2xs text-ink-faint">{notice.code}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className={cn(
                        'inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-ui-2xs',
                        CATEGORY_CLASS[notice.category] ?? 'bg-surface-soft text-ink-muted',
                      )}
                      >
                        {notice.category}
                      </span>
                      {kindDetail(notice) && (
                        <span className="text-ui-2xs text-ink-faint">{kindDetail(notice)}</span>
                      )}
                    </div>
                  </Td>
                )}
                {index === 0 && (
                  <Td rowSpan={notice.casts.length} className="tabular-nums border-b border-line text-ui-2xs">
                    <div className="whitespace-nowrap text-ink-muted">
                      开拍 <b className="font-semibold text-ink">{notice.startDate || '—'}</b>
                    </div>
                    <div className="whitespace-nowrap text-ink-muted">
                      杀青 <b className="font-semibold text-ink">{notice.endDate || '—'}</b>
                    </div>
                    <div className="mt-0.5 text-ink-faint">
                      共 {notice.endDay - notice.startDay + 1} 天
                    </div>
                  </Td>
                )}
                <Td>
                  {cast.role ? (
                    <RolePill role={cast.role} attr="data-case-shooting-role" />
                  ) : (
                    <span className="text-ui-2xs text-ink-faint">—</span>
                  )}
                </Td>
                <Td>
                  <span
                    data-case-shooting-artist={cast.artistId}
                    className="whitespace-nowrap text-ui-xs font-semibold text-ink"
                  >
                    {cast.artistName}
                  </span>
                  <div
                    data-case-shooting-status={cast.status}
                    className={cn(
                      'mt-0.5 inline-flex rounded-full px-1.5 text-ui-2xs',
                      cast.status === 'shooting'
                        ? 'bg-brand-soft font-semibold text-brand-strong'
                        : 'bg-surface-soft text-ink-faint',
                    )}
                  >
                    {STATUS_LABEL[cast.status]}
                  </div>
                </Td>
                <Td className="tabular-nums text-ui-2xs">
                  <span className="text-ui-xs font-bold text-ink">{cast.doneDays}</span>
                  <span className="text-ink-faint"> / {cast.workDays || '—'} 天</span>
                  <div className="mt-0.5 text-ink-faint">每週 ≤ {cast.daysPerWeek || '—'} 天</div>
                </Td>
                <Td className="tabular-nums text-ui-2xs">
                  {cast.status === 'done' ? (
                    <span className="text-ui-2xs text-ink-faint">已拍完</span>
                  ) : (
                    <>
                      <span className="text-ui-xs font-semibold text-ink">{cast.needDays}</span>
                      <span className="text-ink-faint"> 天</span>
                      <div className="mt-0.5 leading-tight text-ink-faint">
                        <div className="whitespace-nowrap">能排 {cast.canShootDays} 天</div>
                        <div className="whitespace-nowrap">
                          距杀青 {Number.isFinite(notice.daysLeft) ? notice.daysLeft : '—'} 天
                        </div>
                      </div>
                    </>
                  )}
                </Td>
                <Td className="tabular-nums text-ui-2xs text-ink-muted">{payText(cast.pay)}</Td>
                <Td>
                  {cast.risk === 'tight' || cast.risk === 'late' ? (
                    <>
                      <span
                        data-case-shooting-risk-label={cast.risk}
                        className={cn(
                          'inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-ui-2xs',
                          cast.risk === 'late'
                            ? 'border-alert-line bg-alert-soft font-bold text-alert'
                            : 'border-gold-line bg-gold-soft font-semibold text-gold',
                        )}
                      >
                        {RISK_LABEL[cast.risk]}
                      </span>
                      {cast.risk === 'tight' && (
                        <div className="mt-0.5 text-ui-2xs text-ink-faint">余量 ≤ 5 天</div>
                      )}
                    </>
                  ) : (
                    <span className="text-ui-2xs text-ink-faint">—</span>
                  )}
                </Td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** 自制通告及其它：玩家自己出品的通告，按游戏里的排列顺序。
 *
 *  这些通告虽然不进 CaseFirm，块里却躺着一段自己的档期：第一个日期是开拍
 *  日（全库都是周一），第二个是杀青日，所以状态照样能推 —— 今天在开拍日
 *  之前是筹备中，夹在中间是拍摄中，过了杀青就是已完成。
 *
 *  一条通告上一人一个角色、各拿各的酬劳，所以跟拍摄中一样「一位艺人一行」，
 *  通告 / 档期 / 状态 / 出品用 rowSpan 合起来。只列自家艺人：对手公司的演员
 *  照样占角色格（不占的话自家艺人会错位），但不占行。 */
function SelfMadePanel({
  notices, emptyTitle, emptyText,
}: { notices: SelfMadeNotice[]; emptyTitle: string; emptyText: string }) {
  // 汇总条上的每个数字都是按钮：点一下只看这一类 / 这一档，再点一下还原。
  const [filter, setFilter] = useState<string>('all');
  const byCategory = new Map<string, number>();
  const byStatus = new Map<SelfMadeStatus, number>();
  let taken = 0;
  const rowsOf = (notice: SelfMadeNotice) => notice.casts.filter((cast) => cast.mine);
  for (const notice of notices) {
    byCategory.set(notice.category, (byCategory.get(notice.category) ?? 0) + 1);
    byStatus.set(notice.status, (byStatus.get(notice.status) ?? 0) + 1);
    if (rowsOf(notice).length > 0) taken += 1;
  }
  if (notices.length === 0) {
    return (
      <div className="mt-2">
        <EmptyState title={emptyTitle} text={emptyText} />
      </div>
    );
  }
  const visible = notices.filter((notice) => {
    if (filter === 'all') return true;
    const [kind, value] = filter.split(':');
    return kind === 'cat' ? notice.category === value : notice.status === value;
  });
  const chip = (on: boolean) => cn(
    'rounded-full px-2 py-0.5 text-ui-2xs transition-colors',
    on
      ? 'bg-brand font-semibold text-white'
      : 'bg-surface-soft text-ink-muted hover:text-brand-strong',
  );
  const toggle = (value: string) => setFilter(filter === value ? 'all' : value);
  return (
    <div data-case-selfmade className="mt-2 rounded-ui-md border border-line bg-surface">
      <div
        data-case-selfmade-summary
        className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2 text-ui-2xs text-ink-faint"
      >
        <button
          type="button"
          data-case-selfmade-filter="all"
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
          className={chip(filter === 'all')}
        >
          共 <span className="tabular-nums">{notices.length}</span> 条
        </button>
        {[...byCategory].map(([category, count]) => {
          const key = `cat:${category}`;
          return (
            <button
              key={key}
              type="button"
              data-case-selfmade-filter={key}
              aria-pressed={filter === key}
              onClick={() => toggle(key)}
              className={chip(filter === key)}
            >
              {category} <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
        {SELF_MADE_STATUS_ORDER.filter((status) => byStatus.get(status)).map((status) => {
          const key = `status:${status}`;
          return (
            <button
              key={key}
              type="button"
              data-case-selfmade-filter={key}
              aria-pressed={filter === key}
              onClick={() => toggle(key)}
              className={chip(filter === key)}
            >
              {SELF_MADE_STATUS_LABEL[status]} <span className="tabular-nums">{byStatus.get(status)}</span>
            </button>
          );
        })}
        <span className="ml-auto tabular-nums text-ink-muted">
          {filter === 'all'
            ? `旗下艺人已接 ${taken} 条 · 还没人接 ${notices.length - taken} 条`
            : `当前 ${visible.length} / ${notices.length} 条`}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse text-ui-xs">
        <thead>
          <tr className="bg-surface-soft text-left text-ui-2xs font-semibold text-ink-muted">
            <Th className="w-[21%]">通告</Th>
            <Th className="w-[15%]">开拍 → 杀青</Th>
            <Th className="w-[8%]">状态</Th>
            <Th className="w-[13%]">角色 / 难度</Th>
            <Th className="w-[14%]">艺人</Th>
            <Th className="w-[11%]">酬劳</Th>
            <Th className="w-[12%]">完成 / 需拍</Th>
            <Th className="w-[8%]">出品</Th>
          </tr>
        </thead>
        <tbody>
          {visible.flatMap((notice) => {
            const mine = rowsOf(notice);
            const rows: (SelfMadeCast | null)[] = mine.length > 0 ? mine : [null];
            return rows.map((cast, index) => (
              <tr
                key={`${notice.code}-${cast?.artistId ?? 'none'}`}
                data-case-selfmade-row={notice.code}
                data-case-selfmade-status={notice.status}
                data-case-selfmade-cast={mine.length}
                className={cn(
                  'align-top',
                  index === 0 ? 'border-t border-line' : '',
                )}
              >
                {index === 0 && (
                  <Td rowSpan={rows.length} className="border-b border-line">
                    <div className="flex items-baseline gap-1.5">
                      <span className="tabular-nums text-ui-2xs text-ink-faint">{notice.seq}</span>
                      <span className="text-ui-xs font-semibold text-ink">{notice.name}</span>
                    </div>
                    <div className="mt-0.5 tabular-nums text-ui-2xs text-ink-faint">{notice.code}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className={cn(
                        'inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-ui-2xs',
                        CATEGORY_CLASS[notice.category] ?? 'bg-surface-soft text-ink-muted',
                      )}
                      >
                        {notice.category}
                      </span>
                      {kindDetail(notice) && (
                        <span className="text-ui-2xs text-ink-faint">{kindDetail(notice)}</span>
                      )}
                    </div>
                  </Td>
                )}
                {index === 0 && (
                  <Td rowSpan={rows.length} className="tabular-nums border-b border-line text-ui-2xs">
                    {notice.startDate ? (
                      <>
                        <div className="whitespace-nowrap text-ink-muted">
                          开拍 <b className="font-semibold text-ink">{notice.startDate}</b>
                        </div>
                        <div className="whitespace-nowrap text-ink-muted">
                          杀青 <b className="font-semibold text-ink">{notice.endDate}</b>
                        </div>
                        <div className="mt-0.5 text-ink-faint">
                          {notice.status === 'shooting'
                            ? `距杀青 ${notice.daysLeft} 天`
                            : notice.status === 'pending'
                              ? notice.daysToStart > 0
                                ? `还有 ${notice.daysToStart} 天开拍`
                                : '还没人接'
                              : notice.status === 'overdue'
                                ? `档期已过 ${-notice.daysLeft} 天`
                                : `共 ${notice.endDay - notice.startDay + 1} 天`}
                        </div>
                      </>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </Td>
                )}
                {index === 0 && (
                  <Td rowSpan={rows.length} className="border-b border-line">
                    <span
                      data-case-selfmade-status-label={notice.status}
                      className={cn(
                        'inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 text-ui-2xs',
                        notice.status === 'shooting'
                          ? 'bg-brand-soft font-semibold text-brand-strong'
                          : notice.status === 'overdue'
                            ? 'bg-alert-soft font-semibold text-alert'
                            : notice.status === 'done'
                              ? 'bg-growth-soft font-semibold text-growth-strong'
                              : 'bg-surface-soft text-ink-muted',
                      )}
                    >
                      {SELF_MADE_STATUS_LABEL[notice.status]}
                    </span>
                  </Td>
                )}
                <Td>
                  {cast?.role ? (
                    <RolePill role={cast.role} attr="data-case-selfmade-role" />
                  ) : (
                    <span className="text-ui-2xs text-ink-faint">—</span>
                  )}
                </Td>
                <Td>
                  {cast ? (
                    <>
                      <span
                        data-case-selfmade-artist={cast.artistId}
                        className="whitespace-nowrap text-ui-xs font-semibold text-ink"
                        title={cast.group ? `签约团体：${cast.group.name}` : cast.artistName}
                      >
                        {cast.group?.name ?? cast.artistName}
                      </span>
                      {cast.group && (
                        <span
                          data-case-selfmade-group={cast.group.name}
                          className="mt-0.5 block text-ui-2xs leading-snug text-ink-faint"
                        >
                          团体 · 队长 {cast.group.leaderName}
                          {cast.group.memberNames.length > 1
                            && ` · 团员 ${cast.group.memberNames.slice(1).join(' · ')}`}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ui-2xs text-ink-faint">还没有艺人接</span>
                  )}
                </Td>
                <Td className="tabular-nums text-ui-2xs text-ink-muted">
                  {cast ? payText(cast.pay) : '—'}
                </Td>
                <Td className="tabular-nums text-ui-2xs">
                  {cast && cast.workDays > 0 ? (
                    <>
                      <span
                        data-case-selfmade-days={`${cast.doneDays}/${cast.workDays}`}
                        className="text-ui-xs font-bold text-ink"
                      >
                        {cast.doneDays}
                      </span>
                      <span className="text-ink-faint"> / {cast.workDays} 天</span>
                      <div className="mt-0.5 text-ink-faint">
                        {cast.needDays > 0 ? `还差 ${cast.needDays} 天` : '已拍完'}
                      </div>
                    </>
                  ) : (
                    <span className="text-ui-2xs text-ink-faint">—</span>
                  )}
                </Td>
                {index === 0 && (
                  <Td rowSpan={rows.length} className="border-b border-line text-ui-2xs text-ink-muted">
                    {notice.company || '—'}
                  </Td>
                )}
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 道具分类页签的固定顺序：一般 / 特殊 / 公司。 */
const ITEM_CAT_ORDER = ['一般物品', '特殊物品', '公司物品'] as const;
type ItemCat = typeof ITEM_CAT_ORDER[number];

/** 分类胶囊：公司物品绿、特殊物品粉、一般物品中性描边，和表格里一致。 */
function itemCategoryClass(category: string): string {
  if (category === '公司物品') return 'bg-accept-soft text-accept';
  if (category === '特殊物品') return 'border border-brand-line bg-brand-soft text-brand-strong';
  return 'border border-line text-ink-faint';
}

/** 道具：按类型分三个页签，每个页签内部再分页（每页 10 件）。
 *  数量 0 的不展示；名称 / 分类 / 说明来自烘焙的道具表（Item.dat）。
 *  只渲染当前页的 10 行，翻页 / 切页签都在这张卡片内完成。 */
function ItemsPanel({
  items, tableCount, signed, gifts, giftSlots,
}: {
  items: OwnedItem[];
  tableCount: number;
  signed: SignedArtist[];
  gifts: Record<string, number[]>;
  giftSlots: Record<string, number>;
}) {
  const owned = useMemo(
    () => items.filter((it) => it.quantity > 0),
    [items],
  );
  /** 送礼好感：反查 Item.dat 的 21 槽位向量，只列这份存档里签约、且加成 > 0 的艺人。 */
  const giftHints = useMemo(() => {
    const out: Record<number, { name: string; value: number }[]> = {};
    for (const it of owned) {
      const vector = gifts[String(it.code)];
      if (!vector) continue;
      const hints: { name: string; value: number }[] = [];
      for (const { option } of signed) {
        const slot = giftSlots[String(option.id)];
        if (slot === undefined) continue;
        const value = vector[slot];
        if (value > 0) hints.push({ name: option.name, value });
      }
      hints.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-Hans-CN'));
      out[it.code] = hints;
    }
    return out;
  }, [owned, signed, gifts, giftSlots]);
  const [tab, setTab] = useState<ItemCat>('一般物品');
  const [page, setPage] = useState(0);
  const PAGE = 10;

  const grouped = useMemo(() => {
    const g: Record<string, OwnedItem[]> = {};
    for (const cat of ITEM_CAT_ORDER) g[cat] = [];
    for (const it of owned) {
      const cat = it.category && (ITEM_CAT_ORDER as readonly string[]).includes(it.category)
        ? it.category
        : '一般物品';
      g[cat].push(it);
    }
    for (const cat of ITEM_CAT_ORDER) g[cat].sort((a, b) => a.code - b.code);
    return g;
  }, [owned]);

  const current = grouped[tab] ?? [];
  const pageCount = Math.max(1, Math.ceil(current.length / PAGE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = current.slice(clampedPage * PAGE, clampedPage * PAGE + PAGE);

  const selectTab = (cat: ItemCat) => { setTab(cat); setPage(0); };
  const goPage = (next: number) => setPage(Math.max(0, Math.min(next, pageCount - 1)));

  return (
    <div data-case-item-panel className="mt-2">
      {/* 三个分类页签：每个带数量；默认停在「一般物品」。 */}
      <div
        data-case-item-tabs
        role="tablist"
        aria-label="道具分类"
        className="flex flex-wrap gap-1.5"
      >
        {ITEM_CAT_ORDER.map((cat) => {
          const active = tab === cat;
          const count = grouped[cat]?.length ?? 0;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              data-case-item-tab={cat}
              data-case-item-count={count}
              aria-selected={active}
              onClick={() => selectTab(cat)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-ui-2xs font-semibold transition-colors',
                active
                  ? 'bg-brand text-white'
                  : 'border border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
              )}
            >
              {cat}
              <span className={cn('tabular-nums', active ? 'text-white/80' : 'text-ink-faint')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 当前页签的一页道具。始终渲染满页（10 行），末页不足用不可见的占位行
          补齐，这样翻页 / 切分类时表格区高度恒定，翻页器不会上下跳。 */}
      <div data-case-item-table className="mt-2 overflow-x-auto">
        {current.length === 0 ? (
          <p className="py-2 text-ui-2xs text-ink-faint">这个分类下没有数量大于 0 的道具。</p>
        ) : (
          <table className="w-full min-w-max border-collapse text-ui-xs">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="w-10 py-1 pr-2 font-medium">编号</th>
                <th className="py-1 pr-2 font-medium">名称</th>
                <th className="w-[72px] py-1 pr-2 font-medium">类型</th>
                <th className="w-10 py-1 pr-2 text-right font-medium">数量</th>
                {tab === '一般物品' && (
                  <th className="w-68 py-1 pr-2 font-medium" title="送给当前存档已签约艺人的好感加成，来自游戏 Item.dat">好感度</th>
                )}
                <th className="py-1 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: PAGE }, (_, i) => {
                const it = pageRows[i];
                if (!it) {
                  // 占位行：拆成与真实行一致的单元格并填入不换行空格，
                  // 这样它的高度 = 真实行高度（一行），翻到不满的末页时表格区
                  // 高度恒定，翻页器不会上下跳。
                  return (
                    <tr key={`pad-${i}`} aria-hidden="true" className="border-t border-line">
                      <td className="py-1.5 pr-2">&nbsp;</td>
                      <td className="py-1.5 pr-2">&nbsp;</td>
                      <td className="py-1.5 pr-2">&nbsp;</td>
                      <td className="py-1.5 pr-2">&nbsp;</td>
                      {tab === '一般物品' && <td className="py-1.5 pr-2">&nbsp;</td>}
                      <td className="py-1.5">&nbsp;</td>
                    </tr>
                  );
                }
                return (
                <tr
                  key={it.code}
                  data-case-item
                  data-case-item-code={it.code}
                  data-case-item-qty={it.quantity}
                  data-case-item-cat={it.category}
                  className="border-t border-line align-top"
                >
                  <td className="py-1.5 pr-2 tabular-nums text-ink-muted">{it.code}</td>
                  <td className="py-1.5 pr-2">
                    <span data-case-item-name className="font-medium text-ink">{it.name}</span>
                    {it.stats && (
                      <span data-case-item-stats className="ml-2 text-ui-2xs text-brand-strong">
                        {it.stats}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    <span
                      data-case-item-type
                      className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-ui-2xs', itemCategoryClass(it.category ?? ''))}
                    >
                      {it.category || '未知物品'}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">×{it.quantity}</td>
                  {tab === '一般物品' && (
                    <td className="py-1.5 pr-2">
                      {giftHints[it.code]?.length ? (
                        <span data-case-item-gift className="flex flex-wrap gap-1">
                          {giftHints[it.code].map((hint) => (
                            <span
                              key={hint.name}
                              data-case-item-gift-name={hint.name}
                              data-case-item-gift-value={hint.value}
                              className={cn(
                                'whitespace-nowrap rounded-full px-1.5 py-0.5 text-ui-2xs tabular-nums',
                                // 同一品牌色系，靠深浅分三档：+4 实心 / +3 浅底 / +1·+2 淡底。
                                hint.value >= 4
                                  ? 'bg-brand font-semibold text-white'
                                  : hint.value === 3
                                    ? 'bg-brand-soft font-medium text-brand-strong'
                                    : 'bg-surface-soft text-brand',
                              )}
                            >
                              {hint.name}+{hint.value}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                  )}
                  <td className="py-1.5 text-ink-muted">
                    {it.desc ? (
                      <span data-case-item-desc className="block" title={it.desc}>{it.desc}</span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 翻页：按惯例放在列表下方，页码可直接点跳。 */}
      {pageCount > 1 && (
        <div
          data-case-item-pager
          className="mt-2 flex flex-wrap items-center justify-start gap-2 text-ui-2xs text-ink-muted"
        >
          <button
            type="button"
            data-case-item-prev
            disabled={clampedPage <= 0}
            onClick={() => goPage(clampedPage - 1)}
            className="rounded-full border border-line px-2.5 py-1 transition-colors hover:border-brand-line hover:text-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一页
          </button>
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              data-case-item-page={i + 1}
              aria-current={clampedPage === i ? 'true' : undefined}
              onClick={() => goPage(i)}
              className={cn(
                'h-6 min-w-6 rounded border px-1 text-ui-2xs tabular-nums transition-colors',
                clampedPage === i
                  ? 'border-brand bg-brand-soft font-bold text-brand-strong'
                  : 'border-line bg-surface text-ink-faint hover:border-brand-line hover:text-brand-strong',
              )}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            data-case-item-next
            disabled={clampedPage >= pageCount - 1}
            onClick={() => goPage(clampedPage + 1)}
            className="rounded-full border border-line px-2.5 py-1 transition-colors hover:border-brand-line hover:text-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一页
          </button>
          <span data-case-item-pageinfo className="ml-1 tabular-nums">
            第 {clampedPage + 1} / {pageCount} 页 · 共 {current.length} 件
          </span>
        </div>
      )}

      <p className="mt-2 text-ui-2xs text-ink-faint">
        编号与数量取自存档；名称 / 分类 / 说明来自烘焙进站点的道具表（Item.dat），共 {tableCount} 件。
      </p>
    </div>
  );
}

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

/** 称号徽标：颜色标线，hover / 键盘聚焦时展开这条线的门槛。 */
function TitleBadge({ title, meta, next }: {
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

function ArtistCard({
  option, artist, works, certificates,
}: {
  option: ArtistOption;
  artist: ArtistStats | null;
  works: WorkRecord[];
  certificates: string[];
}) {
  const worksByType = useMemo(() => {
    const byType = new Map<number, WorkRecord[]>();
    for (const work of works) {
      const list = byType.get(work.noticeIndex) ?? [];
      list.push(work);
      byType.set(work.noticeIndex, list);
    }
    return byType;
  }, [works]);
  return (
    <div data-case-artist className="rounded border border-line bg-surface px-2 py-1.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-ui-xs font-bold text-brand-strong">#{option.id} {option.name}</span>
        <span className="rounded-full bg-surface-soft px-1.5 text-ui-2xs text-ink-faint">
          {option.gender === 'female' ? '女' : '男'}
        </span>
        {artist?.title && (
          <TitleBadge title={artist.title} meta={artist.titleMeta} next={artist.titleNext} />
        )}
        {artist && (
          <span
            data-case-artist-condition
            className={cn(
              'ml-auto rounded-full px-1.5 text-ui-2xs',
              artist.condition && artist.condition !== '正常'
                ? 'bg-alert-soft font-semibold text-alert'
                : 'bg-surface-soft text-ink-faint',
            )}
          >
            {artist.condition}
          </span>
        )}
      </div>
      {artist ? (
        <>
          <div data-case-artist-attrs className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5 text-ui-2xs text-ink-muted">
            {ATTRS.map((attr, i) => (
              <span key={attr} className="flex justify-between gap-1 whitespace-nowrap">
                <span className="text-ink-faint">{attr}</span>
                <b className="text-ink-muted">{artist.abilities[i]}</b>
              </span>
            ))}
          </div>
          {/* 社交数值按关注度分层：友好度（品牌胶囊）> 人气 > 压力 / 疲劳 > 其余次要属性。 */}
          <div data-case-artist-social className="mt-1 flex flex-wrap items-center gap-x-1.5 border-y border-line py-1 text-ui-2xs leading-[1.7]">
            <span data-case-artist-friendship className="rounded bg-brand-soft px-1 font-semibold text-brand-strong">
              友好度 {artist.friendship ?? '—'}
            </span>
            <span data-case-artist-popularity className="rounded bg-surface-soft px-1 font-semibold text-ink">
              人气 {artist.social[3]}
            </span>
            <span className="font-medium text-ink-muted">
              压力 {artist.stress} · 疲劳 {artist.fatigue}
            </span>
            <span className="text-ink-faint">
              叛逆 {artist.social[0]} · 性感 {artist.social[1]} · 亲和 {artist.social[2]} · 曝光 {artist.social[4]} · 礼物 {artist.gifts}
            </span>
          </div>
          <div data-case-artist-counts className="mt-0.5 flex flex-wrap gap-1 text-ui-2xs">
            <span className="text-ink-faint">通告统计</span>
            {NOTICE_COUNT_LABELS.map((label, i) => (
              <WorkCountChip
                key={label}
                dataName="data-case-artist-work-count"
                dataNoticeIndex={i}
                showRole
                label={label}
                value={artist.noticeCounts[i]}
                unit={NOTICE_COUNT_UNITS[i]}
                works={worksByType.get(i) ?? []}
                title={`${label}作品`}
              />
            ))}
            <WorkCountChip
              dataName="data-case-artist-count-total"
              showRole
              label={NOTICE_TOTAL_LABEL}
              value={artist.noticeCounts.reduce((sum, n) => sum + n, 0)}
              works={works}
              title="全部作品"
            />
          </div>
          <div data-case-artist-certs className="mt-0.5 flex flex-wrap items-center gap-1 text-ui-2xs">
            <span className="text-ink-faint">证书</span>
            {certificates.length > 0 ? certificates.map((label) => (
              <span
                key={label}
                data-case-artist-cert={label}
                className="rounded border border-brand-line bg-brand-soft px-1 font-semibold text-brand-strong"
              >
                {label}
              </span>
            )) : (
              <span data-case-artist-cert-none className="text-ink-faint">无</span>
            )}
          </div>
          {/* 奖项：个人奖是金色字（无底色），公司作品奖（年度专辑 / 年度戏剧）单列一行；
              团体奖（最佳团体）归到「我方团体」卡，不挂在这里。 */}
          {(artist.awards.some((award) => !award.company)
            || artist.awards.some((award) => award.company && !award.group)) && (
            <div data-case-artist-awards className="mt-1 border-t border-line pt-1 text-ui-2xs">
              {artist.awards.some((award) => !award.company) && (
                <span className="flex flex-wrap items-center gap-1">
                  <span className="text-ink-faint">奖项</span>
                  {artist.awards.filter((award) => !award.company).map((award) => (
                    <span key={`${award.awardId}-${award.date}-${award.workCode}`} data-case-artist-award data-case-award-id={award.awardId}>
                      <span className="award-item font-semibold text-title-star">{award.ceremony}·{award.label}</span>
                      <span className="award-meta ml-1 font-normal text-ink-faint">{award.workName}</span>
                      <span className="ml-1 font-normal text-ink-faint">{award.date}</span>
                    </span>
                  ))}
                </span>
              )}
              {artist.awards.some((award) => award.company && !award.group) && (
                <span data-case-artist-company-awards className="mt-0.5 flex flex-wrap items-center gap-1">
                  <span className="text-ink-faint">公司奖</span>
                  {artist.awards.filter((award) => award.company && !award.group).map((award) => (
                    <span key={`${award.awardId}-${award.date}-${award.workCode}`} data-case-artist-company-award data-case-award-id={award.awardId}>
                      <span className="award-item font-semibold text-title-star">{award.ceremony}·{award.label}</span>
                      <span className="award-meta ml-1 font-normal text-ink-faint">{award.workName}</span>
                      <span className="ml-1 font-normal text-ink-faint">{award.date}</span>
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
          {artist.events.length > 0 && (
            <div data-case-artist-events className="mt-1 flex flex-wrap items-center gap-1 border-t border-line pt-1 text-ui-2xs">
              <span className="text-ink-faint">活动</span>
              {artist.events.map((event) => (
                <span
                  key={`${event.date}-${event.label}`}
                  data-case-artist-event
                  data-case-event-kind={event.kind}
                  data-case-event-scale={event.scale}
                  className="rounded border border-brand-line bg-brand-soft px-1 font-semibold text-brand-strong"
                >
                  {event.label}
                  <span className="ml-1 font-normal text-ink-muted">{event.date}</span>
                </span>
              ))}
            </div>
          )}
          {artist.contract && (
            <details data-case-artist-contract className="mt-1 border-t border-line pt-1 text-ui-2xs">
              <summary className="cursor-pointer text-ink-faint">
                合约信息
                <span className="ml-1 text-ink-faint">
                  {artist.contract.signDate} - {artist.contract.expireDate}
                </span>
              </summary>
              <div data-case-artist-contract-detail className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-1 text-ink-muted">
                <span>签约时间 <b className="font-semibold text-ink">{artist.contract.signDate}</b></span>
                <span>合约期限 <b className="font-semibold text-ink">{artist.contract.expireDate}</b></span>
                <span>签约金 <b className="font-semibold text-ink">{moneyText(artist.contract.signingBonus)}</b></span>
                <span>艺人分红 <b className="font-semibold text-ink">{artist.contract.dividend}%</b></span>
              </div>
            </details>
          )}
        </>
      ) : (
        <p className="mt-1 text-ui-2xs text-ink-faint">这份存档里还没有这位的状态块。</p>
      )}
    </div>
  );
}

function Th({ children, className, dataAttrs }: {
  children: ReactNode;
  className?: string;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <th {...dataAttrs} className={cn('border-b border-line px-3 py-2 font-semibold', className)}>
      {children}
    </th>
  );
}

function Td({ children, className, title, colSpan, rowSpan, dataAttrs }: {
  children?: ReactNode;
  className?: string;
  title?: string;
  colSpan?: number;
  rowSpan?: number;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <td
      title={title}
      colSpan={colSpan}
      rowSpan={rowSpan}
      {...dataAttrs}
      className={cn('border-b border-line px-3 py-2 align-top', className)}
    >
      {children}
    </td>
  );
}

/** 课程 / 打工 → 能加的属性（玩家口述）：hover 差值时按缺口属性推荐。
 *  打工只列属性、不铺每档数值：存档读不到当前是新手还是资深，按属性给方向就够。 */
const TRAINING_COURSES: { name: string; attrs: string[] }[] = [
  { name: '音感发声', attrs: ['歌艺', '自信'] },
  { name: '乐器乐理', attrs: ['歌艺', '才智'] },
  { name: '声音表情', attrs: ['演技', '口才'] },
  { name: '肢体动作', attrs: ['演技', '动感'] },
  { name: '说话技巧', attrs: ['口才', '自信'] },
  { name: '摄影训练', attrs: ['仪态', '体能'] },
  { name: '舞台表演', attrs: ['仪态', '动感'] },
  { name: '有氧舞蹈', attrs: ['动感', '体能'] },
  { name: '快速记忆', attrs: ['口才', '才智'] },
  { name: '美姿美仪', attrs: ['仪态', '自信'] },
];

/** 只列能补的正向属性：压力 / 疲劳是副作用，唱片助理的动感是 -1，都不算。 */
const WORKS: { name: string; attrs: string[] }[] = [
  { name: '唱片助理', attrs: ['歌艺', '才智'] },
  { name: '戏剧配音', attrs: ['演技', '名气', '自信'] },
  { name: '幕后合音', attrs: ['歌艺', '仪态', '名气'] },
  { name: 'MV 演出', attrs: ['演技', '名气', '自信'] },
  { name: '节目助理', attrs: ['口才', '体能', '名气', '自信'] },
  { name: '舞群伴舞', attrs: ['动感', '体能', '名气'] },
  { name: '平面模特', attrs: ['仪态', '自信', '名气'] },
];

type CourseHint = { kind: '训练' | '打工' | '道具'; name: string; attrs: string[]; text?: string };
const HINTS_BY_ATTR: Record<string, CourseHint[]> = {};
for (const course of TRAINING_COURSES) {
  for (const attr of course.attrs) {
    (HINTS_BY_ATTR[attr] ??= []).push({ kind: '训练', name: course.name, attrs: course.attrs });
  }
}
for (const work of WORKS) {
  for (const attr of work.attrs) {
    (HINTS_BY_ATTR[attr] ??= []).push({ kind: '打工', name: work.name, attrs: work.attrs });
  }
}

/** 道具属性行（Item.dat 原文，繁体）里的属性写法 -> 页面简体名。
 *  九项能力带数字（口才+10），社交门槛（叛逆/性感/亲和/人气/曝光）常写成
 *  「親和力上升 / 性感上升叛逆上升」这种没有数字的定性描述，两种都要认。
 *  只列正向加成；像八卦雜誌「才智-20」、冰山雪蓮「人氣-40」这类负项不算「能补」。 */
const ITEM_ATTR_TRAD: Record<string, string> = {
  演技: '演技', 口才: '口才', 才智: '才智', 自信: '自信',
  儀態: '仪态', 動感: '动感', 體能: '体能', 歌藝: '歌艺', 名氣: '名气',
  叛逆: '叛逆', 性感: '性感', 親和: '亲和', 親和力: '亲和',
  人氣: '人气', 曝光: '曝光',
};
// 「XX上升」没有数字，只能靠上面的繁体写法白名单匹配；长的写法排前面，
// 这样「親和力上升」不会被「親和」抢先切成两半。
const ITEM_RISING_RE = new RegExp(
  `(${Object.keys(ITEM_ATTR_TRAD).sort((a, b) => b.length - a.length).join('|')})上升`,
  'g',
);

/** 学院结业证书：特殊物品里每位艺人各有戏剧 / 音乐 / 舞蹈三张，道具说明以
 *  艺人的游戏内名字开头；「藝人的…」那几张是通用道具，不挂到任何人身上。 */
const CERT_KINDS = [
  { word: '舞蹈', label: '舞蹈' },
  { word: '戲劇', label: '戏剧' },
  { word: '音樂', label: '音乐' },
] as const;

function artistCertificates(items: OwnedItem[], tables: CaseTables): Map<number, string[]> {
  const byId = new Map<number, string[]>();
  const nameToId: Array<[string, number]> = Object.entries(tables.stars ?? {})
    .filter(([, info]) => !!info?.[0])
    .map(([id, info]) => [info[0], Number(id)] as [string, number])
    .sort((a, b) => b[0].length - a[0].length);
  for (const item of items) {
    if (item.quantity <= 0) continue;
    const name = item.name ?? '';
    if (!name.includes('證書')) continue;
    const kind = CERT_KINDS.find((k) => name.includes(k.word));
    if (!kind) continue;
    const owner = nameToId.find(([star]) => item.desc?.startsWith(star));
    if (!owner) continue;
    const list = byId.get(owner[1]) ?? [];
    if (!list.includes(kind.label)) list.push(kind.label);
    byId.set(owner[1], list);
  }
  for (const list of byId.values()) {
    list.sort((a, b) => CERT_KINDS.findIndex((k) => k.label === a) - CERT_KINDS.findIndex((k) => k.label === b));
  }
  return byId;
}

/** 从存档已拥有的道具里建「缺口属性 -> 可补道具」索引。显示沿用道具表原文
 *  （和道具面板一致），一行里所有增减都写出来，不只写补的那一项。 */
function itemHintsFor(items: OwnedItem[]): Record<string, CourseHint[]> {
  const out: Record<string, CourseHint[]> = {};
  for (const it of items) {
    if (it.quantity <= 0 || !it.stats) continue;
    const matched = new Set<string>();
    // 带数字：口才+10 / 性感+50；只收正向，才智-20 / 人氣-40 不算。
    for (const [, attr, raw] of it.stats.matchAll(/([^\s+\-]+)([+-]\d+)/g)) {
      const simple = ITEM_ATTR_TRAD[attr];
      if (!simple || Number(raw) <= 0) continue;
      matched.add(simple);
    }
    // 无数字：親和力上升 / 性感上升叛逆上升（男性香水一行补两项）。
    for (const [, attr] of it.stats.matchAll(ITEM_RISING_RE)) {
      const simple = ITEM_ATTR_TRAD[attr];
      if (simple) matched.add(simple);
    }
    const text = `${it.name ?? `道具 ${it.code}`}（${it.stats.replace(/\s+/g, '，')}）`;
    for (const attr of matched) {
      (out[attr] ??= []).push({ kind: '道具', name: it.name ?? `道具 ${it.code}`, attrs: [attr], text });
    }
  }
  return out;
}

/** Hover a missing ability and see what can raise it. Portal to body so the
 *  popover is not clipped by the case tab's own overflow-y content column.
 *  Moving the mouse onto the popover keeps it open; leaving closes it. */
function GapCourseHint({
  gap, itemHints, social = false,
}: { gap: { attr: string; diff: number }; itemHints: Record<string, CourseHint[]>; social?: boolean }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 社交门槛没有训练 / 打工课程，只看道具联动；九项能力照旧两者都有。
  const hints = [
    ...(social ? [] : HINTS_BY_ATTR[gap.attr] ?? []),
    ...(itemHints[gap.attr] ?? []),
  ];

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  useEffect(() => () => cancelClose(), [cancelClose]);

  // 社交门槛保留原来的粉色小标签；没有可补道具时也不改变既有外观。
  const pill = social
    ? 'inline-flex items-center rounded-full border border-brand-line bg-brand-soft px-1.5 py-0.5 align-baseline font-semibold text-brand-strong'
    : '';
  const text = <>{gap.attr} {Math.ceil(gap.diff)}</>;
  if (hints.length === 0) {
    return social
      ? <span data-case-social-gap title="从存档读取的附加属性门槛（无等级）" className={pill}>{text}</span>
      : <span>{text}</span>;
  }
  return (
    <span
      data-case-course-hint={gap.attr}
      {...(social ? { 'data-case-social-gap': '' } : {})}
      title={social ? '从存档读取的附加属性门槛（无等级）' : undefined}
      className={cn('cursor-help decoration-dotted underline-offset-2 hover:underline', pill)}
      onMouseEnter={(ev) => {
        cancelClose();
        const r = ev.currentTarget.getBoundingClientRect();
        setAnchor({ x: r.left + r.width / 2, y: r.top });
      }}
      // 留一点时间让鼠标穿过触发词和浮窗之间的 6px 空隙
      onMouseLeave={() => {
        cancelClose();
        closeTimer.current = setTimeout(() => setAnchor(null), 150);
      }}
    >
      {text}
      {anchor && createPortal(
        <div
          data-case-course-popover
          className="pointer-events-auto fixed z-50 w-[360px] rounded-ui-md border border-line-strong bg-surface px-2.5 py-1.5 text-ui-2xs shadow-lg"
          style={{ left: anchor.x, top: anchor.y - 6, transform: 'translate(-50%, -100%)' }}
          onMouseEnter={cancelClose}
          onMouseLeave={() => setAnchor(null)}
        >
          <div className="mb-0.5 font-semibold text-brand-strong">可补 {gap.attr}</div>
          {(['训练', '打工', '道具'] as const).map((kind) => {
            const group = hints.filter((hint) => hint.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <div className="font-semibold text-ink-faint">【{kind}】</div>
                {group.map((hint) => {
                  // 道具整行照抄道具表（含负项），训练 / 打工只列能补的属性。
                  const shown = hint.text ?? (() => {
                    const pair = hint.attrs.slice(0, 2).includes(gap.attr)
                      ? hint.attrs.slice(0, 2)
                      : [gap.attr, ...hint.attrs.filter((attr) => attr !== gap.attr)].slice(0, 2);
                    return `${hint.name}（${pair.join(' · ')}）`;
                  })();
                  return (
                    <div key={hint.name} className="whitespace-nowrap pl-3 text-ink-muted">
                      {shown}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </span>
  );
}

/** Only the rolled thresholds; each artist's verdict lives in its own column. */
function RequirementChips({ role }: { role: RoleRecord }) {
  if (role.requirements.length === 0) return <span className="text-ui-2xs text-ink-faint">无能力要求</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {role.requirements.map((req) => (
        <span
          key={req.attr}
          data-case-value
          data-case-social={req.social ? 'yes' : undefined}
          title={req.social
            ? `${req.attr} ≥ ${req.value}（角色接演门槛，从存档读取，无等级）`
            : `${req.attr} ${req.value}，静态等级 ${req.staticGrade || '未标注'}`}
          className={cn(
            'inline-flex items-baseline gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-ui-2xs text-ink-muted',
            req.social
              ? 'border-brand-line bg-brand-soft text-brand-strong'
              : 'border-line-strong bg-surface',
          )}
        >
          {req.attr}
          <b className="text-ui-xs text-brand-strong">{req.value}</b>
          {(req.staticGrade || req.rolledGrade) && (
            <i className="not-italic text-ink-faint">{req.staticGrade || req.rolledGrade}</i>
          )}
        </span>
      ))}
    </div>
  );
}

/** One column holds every signed artist's verdict, one line per artist.
 *  A 團體 role is matched against each group's leader instead, so only the
 *  captain's numbers decide whether the group can take it. */
function MatchList({ role, signed, groups, artists, itemHints, cellClass }: {
  role: RoleRecord;
  signed: SignedArtist[];
  groups: GroupRecord[];
  artists: ArtistStats[];
  itemHints: Record<string, CourseHint[]>;
  cellClass?: string;
}) {
  const groupRole = isGroupRole(role);
  // 存档没有团体成员名单，只有团体数值：团体通告就只列团体本身，不硬凑差值。
  if (groupRole && groups.length > 0 && groups.every((group) => !group.leaderId)) {
    return (
      <Td className={cellClass} dataAttrs={{ 'data-case-match-list': 'yes' }}>
        {groups.map((group) => (
          <div key={group.code} data-case-match data-match-result="info" className="text-ui-2xs leading-[1.5] text-ink-muted">
            <span className="select-none text-ink-faint" aria-hidden="true">•</span>{' '}
            <span>团体 {group.name}</span>{' '}
            <span className="text-ink-faint">{group.memberNames.join(' · ') || '成员未记录'}</span>
          </div>
        ))}
      </Td>
    );
  }
  // 被别的艺人预约的角色是「已占用」，不是「差多少数值」。这里只留一条横杠，
  // 谁占用的只写在「预约」列，避免同一句话说两遍。
  if (role.reservedBy) {
    return (
      <Td className={cellClass} dataAttrs={{ 'data-case-match-list': 'yes' }}>
        <div data-case-match data-match-result="no" className="text-ui-2xs text-ink-faint">
          <span aria-label="已被预约" title="已被预约">—</span>
        </div>
      </Td>
    );
  }
  const rows = groupRole
    ? groups.map((group) => {
        const leader = artists.find((a) => a.roleId === group.leaderId) ?? null;
        return {
          key: `group-${group.code}`,
          group,
          match: matchGroupRole(role, leader, group.name, group.leaderName),
        };
      })
    : signed
      .filter((item) => item.artist && canTakeRole(role, item.option.gender))
      .map((item) => ({
        key: `artist-${item.option.id}`,
        group: null,
        match: matchRole(role, item.artist as ArtistStats, item.option.name, item.option.gender),
      }));
  // 可以接的一位排在最上面，更显眼。
  rows.sort((a, b) => Number(b.match.canAccept) - Number(a.match.canAccept));
  return (
    <Td className={cellClass} dataAttrs={{ 'data-case-match-list': 'yes' }}>
      {rows.length === 0 ? (
        <span className="text-ui-2xs text-ink-faint">—</span>
      ) : (
        <div data-case-match-group className="flex flex-col gap-1">
          {rows.map(({ key, match, group }) => (
            <div
              key={key}
              data-case-match
              data-case-match-group={groupRole ? 'yes' : undefined}
              data-match-artist={match.artistName}
              data-match-result={match.canAccept ? 'yes' : 'no'}
              // 圆点当成固定窄栏（shrink-0），正文在它右边自然换行：圆点永远不会
              // 被挤到单独一行，长文本也只在正文栏里折行，不会重叠或挤成一团。
              className={cn(
                'flex items-start gap-1.5 text-ui-2xs leading-[1.5]',
                match.canAccept ? 'font-semibold' : 'text-alert',
              )}
            >
              <span className="shrink-0 select-none leading-[1.6] text-ink-faint" aria-hidden="true">•</span>
              <span className="min-w-0 flex-1">
                {/* 「可以接」绿与称号 hover 的达标绿共用 title-model 色系：
                    两处都是「已满足」的 yes 信号，别各用一种绿。 */}
                {match.canAccept ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-title-model-line bg-title-model-soft px-2 py-0.5 align-middle text-title-model">
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="h-2.5 w-2.5">
                      <path d="M2.5 6.2 4.8 8.5 9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <b>{match.artistName}</b> 可以接
                  </span>
                ) : (
                  <span>
                    <b>{match.artistName}</b>{' '}
                    差{' '}
                    {match.gaps
                      .filter((gap) => gap.diff > 0)
                      .map((gap, index) => (
                        <Fragment key={gap.attr}>
                          {index > 0 && ' · '}
                          <GapCourseHint gap={gap} itemHints={itemHints} social={gap.social} />
                        </Fragment>
                      ))}
                  </span>
                )}
                {/* 团体通告是整团接的：队长与团员另起一行列全。 */}
                {group && group.memberNames.length > 0 && (
                  <span
                    data-case-match-members
                    className="mt-1 block font-normal text-ink-faint"
                  >
                    队长 {group.memberNames[0]}
                    {group.memberNames.length > 1 && ` · 团员 ${group.memberNames.slice(1).join(' · ')}`}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </Td>
  );
}

/** Notice-level data appears on the first role row only; continuation rows keep
 *  those columns blank, with no arrow or repeated text. No rowspan, so a
 *  reserved role only dims its own cells and never the whole notice. */
function NoticeRows({
  notice, signed, groups, artists, itemHints,
}: {
  notice: CaseNotice;
  signed: SignedArtist[];
  groups: GroupRecord[];
  artists: ArtistStats[];
  itemHints: Record<string, CourseHint[]>;
}) {
  const closing = notice.status === 'closing';
  // 工作天数按角色显示：电视剧 / 电影里男主角、配角各自的天数不同，通告第一行
  // 只显示第一个角色的天数会漏掉其他人。这里给每个角色行渲染自己的胶囊；
  // 起止日期仍是通告级信息，只在第一行给。无角色记录时退回通告自带的 workDays。
  const workDaysBadge = (role?: RoleRecord) => {
    const workDays = role?.workDays ?? notice.workDays;
    const daysPerWeek = role?.daysPerWeek ?? notice.daysPerWeek;
    if (!workDays) return null;
    return (
      <div
        data-case-workdays
        data-case-role-name={role?.role ?? ''}
        data-case-work-days={workDays}
        title={role
          ? `角色「${role.role}」需要工作 ${workDays} 天，每周最多排 ${daysPerWeek} 天（拍摄期共 ${notice.execDays} 天）`
          : `这张通告需要工作 ${workDays} 天，每周最多排 ${daysPerWeek} 天`}
        className="mt-1 flex flex-wrap items-center gap-1"
      >
        <span className="inline-flex items-center whitespace-nowrap rounded-ui-md bg-brand-soft px-1.5 py-0.5 text-ui-2xs font-semibold text-brand-strong">
          工作 {workDays} 天
        </span>
        <span className="inline-flex items-center whitespace-nowrap rounded-ui-md bg-brand-soft px-1.5 py-0.5 text-ui-2xs font-normal text-brand-strong">
          每周 ≤{daysPerWeek} 次
        </span>
      </div>
    );
  };
  const noticeCells = (
    <>
      <Td>
        <div className="font-semibold">{notice.name}</div>
        <div className="mt-0.5 text-ui-2xs text-ink-faint">{notice.code}</div>
        {closing && (
          <span className="mt-1 inline-block rounded-full bg-alert-soft px-1.5 py-0.5 text-ui-2xs font-semibold text-alert">
            即将截止
          </span>
        )}
        {notice.status === 'upcoming' && (
          <span
            data-case-upcoming
            title="这张通告会在下周一公司更新时开放接取"
            className="mt-1 inline-block rounded-full bg-tag-follow-soft px-1.5 py-0.5 text-ui-2xs font-semibold text-tag-follow"
          >
            下周更新
          </span>
        )}
        {notice.status === 'expired' && (
          <span className="mt-1 inline-block rounded-full bg-surface-soft px-1.5 py-0.5 text-ui-2xs text-ink-faint">
            已停止接取
          </span>
        )}
      </Td>
      <Td>
        <span className={cn(
          'inline-block rounded-full px-2 py-0.5 text-ui-2xs font-semibold',
          CATEGORY_CLASS[notice.category] ?? 'bg-surface-soft text-ink-muted',
        )}>
          {notice.category}
        </span>
        {notice.type && <div className="mt-1 text-ui-2xs text-ink-faint">{notice.type}</div>}
      </Td>
      <Td>{notice.company || '—'}</Td>
      <Td title="开放接取与停止接取">
        <div className="whitespace-nowrap text-ui-2xs leading-[1.7]">
          <div><span className="text-ink-faint">开放</span> <b className="text-ink-muted">{notice.openDate || '—'}</b></div>
          <div><span className="text-ink-faint">停止</span> <b className={closing ? 'text-alert' : 'text-ink-muted'}>{notice.deadline || '—'}</b></div>
        </div>
        {Number.isFinite(notice.daysToDeadline) && notice.daysToDeadline >= 0 && (
          <span className={cn(
            'mt-1 inline-block rounded-full px-1.5 py-0.5 text-ui-2xs font-semibold',
            closing ? 'bg-alert-soft text-alert' : 'bg-surface-soft text-ink-faint',
          )}>
            还剩 {notice.daysToDeadline} 天
          </span>
        )}
      </Td>
      <Td title="通告执行期间，以及这张通告实际需要的工作天数">
        <div className="text-ui-2xs leading-[1.7]">
          <div className="whitespace-nowrap">起 <b className="text-ink-muted">{notice.periodStart || '—'}</b></div>
          <div className="whitespace-nowrap">
            止 <b className="text-ink-muted">{notice.periodEnd || '—'}</b>
            <span className="ml-1 text-ink-faint">共 {notice.execDays} 天</span>
          </div>
        </div>
        {workDaysBadge(notice.roles[0])}
        {notice.executedDays > 0 && notice.remainingDays > 0 ? (
          <span className="mt-1 inline-block rounded-full bg-tag-follow-soft px-1.5 py-0.5 text-ui-2xs text-tag-follow">
            进行中 · 已执行 {notice.executedDays} 天 / 剩 {notice.remainingDays} 天
          </span>
        ) : Number.isFinite(notice.daysToStart) && notice.daysToStart > 0 ? (
          <span className="mt-1 inline-block rounded-full bg-surface-soft px-1.5 py-0.5 text-ui-2xs text-ink-faint">
            {notice.daysToStart} 天后开拍
          </span>
        ) : null}
      </Td>
    </>
  );

  // 后续角色行：前四列留空，第五格（执行期间列）放这名角色自己的工作天数。
  // 这样同一通告里不同角色类型的天数逐行可见，不再只有第一个角色的数字。
  const blankCells = (role: RoleRecord) => (
    <><Td /><Td /><Td /><Td /><Td>{workDaysBadge(role)}</Td></>
  );

  /** 只显示结果，不在这里编辑：设置入口在表格上方的「预约设置」。 */
  const reservationCell = (role: RoleRecord, reserved: boolean) => (
    <Td className={reserved ? 'bg-surface-soft' : undefined}>
      {role.reservedBy ? (
        <span data-case-reservation className="whitespace-nowrap text-ui-2xs font-semibold text-brand-strong">
          {role.reservedBy}
        </span>
      ) : (
        <span className="text-ui-2xs text-ink-faint">—</span>
      )}
    </Td>
  );

  if (notice.roles.length === 0) {
    return (
      <tbody data-case-notice data-case-status={notice.status}>
        <tr data-case-role className="border-t border-line-strong">
          {noticeCells}
          <Td className="text-ink-faint" colSpan={4}>
            存档里没有该通告的角色需求记录
            {workDaysBadge()}
          </Td>
          <Td className="text-ink-faint">—</Td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody data-case-notice data-case-status={notice.status}>
      {notice.roles.map((role, index) => {
        const reserved = Boolean(role.reservedBy);
        // Only the role-level cells dim; notice-level cells stay bright.
        const roleCell = reserved
          ? 'bg-surface-soft text-ink-faint opacity-60'
          : undefined;
        return (
          <tr
            key={role.roleCode + role.offset}
            data-case-role
            data-case-reserved={reserved ? 'yes' : 'no'}
            data-case-role-name={role.role}
            className={cn('hover:bg-surface-soft', index === 0 && 'border-t border-line-strong')}
          >
            {index === 0 ? noticeCells : blankCells(role)}
            <Td className={roleCell}>
              <RolePill role={role} />
            </Td>
            <Td className={roleCell}>
              <RequirementChips role={role} />
            </Td>
            <MatchList role={role} signed={signed} groups={groups} artists={artists} itemHints={itemHints} cellClass={roleCell} />
            {reservationCell(role, reserved)}
          </tr>
        );
      })}
    </tbody>
  );
}
