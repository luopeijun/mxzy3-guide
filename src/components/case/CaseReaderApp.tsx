import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import EmptyState from '../EmptyState';
import { cn } from '../../lib/cn';
import {
  ARTIST_DIRECTORY, ATTRS, EMPTY_TABLES, NOTICE_COUNT_LABELS, NOTICE_COUNT_UNITS, NOTICE_TOTAL_LABEL,
  buildGroupRecord, canTakeNotice, canTakeRole, isAcceptable, isGroupRole, matchGroupRole, matchRole, moneyText, parseSave, toCsv,
  type ArtistOption, type ArtistStats, type CaseNotice, type CaseTables,
  type GroupRecord, type OwnedItem, type ParseResult, type RoleRecord, type SelfMadeCast,
  type SelfMadeNotice, type SelfMadeStatus, type ShootingNotice,
  type TitleLine, type TitleMeta,
} from '../../lib/caseParser';
import type { TitleGapItem, TitleNext } from '../../lib/titleLadder';

const TABLES_URL = `${import.meta.env.BASE_URL}data/case-tables.json`;

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

/** One artist the save marks as signed, plus the state block holding their numbers. */
interface SignedArtist {
  option: ArtistOption;
  artist: ArtistStats | null;
}

function chipClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-ui-2xs transition-colors',
    active
      ? 'border-brand bg-brand font-semibold text-white'
      : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
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
      className="rounded-ui-md border border-line bg-surface p-3 shadow-soft"
    >
      <p className="px-1 text-ui-2xs font-semibold text-ink-faint">本页小结</p>
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
    </nav>
  );
}

/** 右栏「艺人速查」：顶部完整卡片不动，这里只留对照通告表格时一眼要扫的
 *  九项属性 + 状态 + 社交三项；友好度、压力疲劳、通告统计仍在顶部卡片里。
 *  列表在剩余高度内自己滚，本页小结钉在上方不受影响。 */
function ArtistQuickRef({ signed }: { signed: SignedArtist[] }) {
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
          ) : signed.map(({ option, artist }) => (
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** 存档解析：把 .sa2 拖进来，在浏览器里解出当期通告、日期与艺人数值。
 *  文件不会上传；读进内存的就是一份快照，游戏随后覆盖自动存档也不影响。 */
export default function CaseReaderApp() {
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
  }, []);

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
                    <ArtistCard option={option} artist={artist} />
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
                    </div>
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
                    {result.items.filter((it) => it.quantity > 0).length} 件（数量 0 不计）
                  </span>
                </summary>
                <ItemsPanel
                  items={result.items}
                  tableCount={Object.keys(tables.items).length}
                />
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
          <ArtistQuickRef signed={signedArtists} />
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
                                : '档期已过，没人接'
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
  items, tableCount,
}: { items: OwnedItem[]; tableCount: number }) {
  const owned = useMemo(
    () => items.filter((it) => it.quantity > 0),
    [items],
  );
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
          <table className="w-full table-fixed border-collapse text-ui-xs">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="w-16 py-1 pr-2 font-medium">编号</th>
                <th className="py-1 pr-2 font-medium">名称</th>
                <th className="w-24 py-1 pr-2 font-medium">类型</th>
                <th className="w-16 py-1 pr-2 text-right font-medium">数量</th>
                <th className="py-1 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: PAGE }, (_, i) => {
                const it = pageRows[i];
                if (!it) {
                  // 占位行：拆成与真实行一致的 5 个单元格并填入不换行空格，
                  // 这样它的高度 = 真实行高度（一行），翻到不满的末页时表格区
                  // 高度恒定，翻页器不会上下跳。
                  return (
                    <tr key={`pad-${i}`} aria-hidden="true" className="border-t border-line">
                      <td className="py-1.5 pr-2">&nbsp;</td>
                      <td className="py-1.5 pr-2">&nbsp;</td>
                      <td className="py-1.5 pr-2">&nbsp;</td>
                      <td className="py-1.5 pr-2">&nbsp;</td>
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
                      className={cn('rounded-full px-2 py-0.5 text-ui-2xs', itemCategoryClass(it.category ?? ''))}
                    >
                      {it.category || '未知物品'}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">×{it.quantity}</td>
                  <td className="py-1.5 text-ink-muted">
                    {it.desc ? (
                      <span data-case-item-desc className="block truncate" title={it.desc}>{it.desc}</span>
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
  music: '专辑养成', host: '节目养成', model: '广告养成',
  screen: '电视 / 电影作品养成', star: '演技 + 歌艺双线', other: '跨线状态',
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

const TITLE_NEED_UNIT: Record<string, string> = Object.fromEntries(
  NOTICE_COUNT_LABELS.map((label, i) => [label, NOTICE_COUNT_UNITS[i]]),
);

/** 门槛一律写成「节目 需 3 档，还差 2 档」这一句，跟游戏通告统计的名词对齐。 */
function needGapText(item: TitleGapItem): string {
  const unit = TITLE_NEED_UNIT[item.label] ?? '';
  const need = `${item.need}${unit}`;
  if (item.diff === null) return `${item.label} 需 ${need}`;
  if (item.diff === 0) return `${item.label} 需 ${need}，已够`;
  return `${item.label} 需 ${need}，还差 ${item.diff}${unit}`;
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
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-[236px] rounded-ui-sm border border-line bg-surface p-2 text-left opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
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
                {label} <b className="tabular-nums">{value}{TITLE_NEED_UNIT[label] ?? ''}</b>
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
            <span className="mt-1 flex flex-wrap gap-1">
              {next.items.map((item) => (
                <span
                  key={item.label}
                  className={cn(
                    'rounded px-1 text-ui-2xs tabular-nums',
                    item.diff === 0
                      ? 'bg-title-model-soft text-title-model'
                      : item.diff === null
                        ? 'bg-surface-soft text-ink-muted'
                        : 'bg-alert-soft text-alert',
                  )}
                >
                  {needGapText(item)}
                </span>
              ))}
            </span>
          </span>
        ) : meta?.rank !== null && meta?.rank !== undefined ? (
          <span
            data-case-artist-title-next
            className="mt-1.5 block border-t border-line pt-1.5 text-ui-2xs text-ink-faint"
          >
            已经是本线最高档。
          </span>
        ) : null}
        <span className="mt-1 block text-ui-2xs text-ink-faint">同一时间只挂一个称号。</span>
      </span>
    </span>
  );
}

function ArtistCard({ option, artist }: { option: ArtistOption; artist: ArtistStats | null }) {
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
          <div className="mt-1 border-t border-line pt-1 text-ui-2xs leading-[1.7] text-ink-faint">
            <span data-case-artist-friendship className="mr-1 rounded bg-brand-soft px-1 font-semibold text-brand-strong">
              友好度 {artist.friendship ?? '—'}
            </span>
            压力 {artist.stress} · 疲劳 {artist.fatigue} · 叛逆 {artist.social[0]} · 性感 {artist.social[1]} · 亲和 {artist.social[2]} · 人气 {artist.social[3]} · 曝光 {artist.social[4]} · 礼物 {artist.gifts}
          </div>
          <div data-case-artist-counts className="mt-0.5 flex flex-wrap gap-1 text-ui-2xs">
            <span className="text-ink-faint">通告统计</span>
            {NOTICE_COUNT_LABELS.map((label, i) => (
              <span key={label} className="rounded bg-surface-soft px-1 text-ink-muted">
                {label} <b>{artist.noticeCounts[i]}</b>{NOTICE_COUNT_UNITS[i]}
              </span>
            ))}
            <span data-case-artist-count-total className="rounded bg-surface-soft px-1 text-ink-muted">
              {NOTICE_TOTAL_LABEL} <b>{artist.noticeCounts.reduce((sum, n) => sum + n, 0)}</b>
            </span>
          </div>
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

/** 课程 → 属性（玩家口述补齐表）：hover 差值时按缺口属性推荐可上的课。
 *  名气没有对应课程，表里缺它就自然不弹浮窗。 */
const TRAINING_COURSES: { name: string; attrs: [string, string] }[] = [
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
const COURSES_BY_ATTR = TRAINING_COURSES.reduce<Record<string, typeof TRAINING_COURSES>>((acc, course) => {
  for (const attr of course.attrs) (acc[attr] ??= []).push(course);
  return acc;
}, {});

/** Hover a missing ability and see which classes raise it. Portal to body so the
 *  popover is not clipped by the case tab's own overflow-y content column. */
function GapCourseHint({ gap }: { gap: { attr: string; diff: number } }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const courses = COURSES_BY_ATTR[gap.attr] ?? [];
  if (courses.length === 0) return <span>{gap.attr} {Math.ceil(gap.diff)}</span>;
  return (
    <span
      data-case-course-hint={gap.attr}
      className="cursor-help decoration-dotted underline-offset-2 hover:underline"
      onMouseEnter={(ev) => {
        const r = ev.currentTarget.getBoundingClientRect();
        setAnchor({ x: r.left + r.width / 2, y: r.top });
      }}
      onMouseLeave={() => setAnchor(null)}
    >
      {gap.attr} {Math.ceil(gap.diff)}
      {anchor && createPortal(
        <div
          data-case-course-popover
          className="pointer-events-none fixed z-50 w-max rounded-ui-md border border-line-strong bg-surface px-2.5 py-1.5 text-ui-2xs shadow-lg"
          style={{ left: anchor.x, top: anchor.y - 6, transform: 'translate(-50%, -100%)' }}
        >
          <div className="mb-0.5 font-semibold text-brand-strong">可上课程 · {gap.attr}</div>
          {courses.map((course) => (
            <div key={course.name} className="whitespace-nowrap text-ink-muted">
              {course.name}（{course.attrs.join(' · ')}）
            </div>
          ))}
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
function MatchList({ role, signed, groups, artists, cellClass }: {
  role: RoleRecord;
  signed: SignedArtist[];
  groups: GroupRecord[];
  artists: ArtistStats[];
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
                {match.canAccept ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-accept-line bg-accept-soft px-2 py-0.5 align-middle text-accept">
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
                          {gap.social ? (
                            <span
                              data-case-social-gap
                              title="从存档读取的附加属性门槛（无等级）"
                              className="inline-flex items-center rounded-full border border-brand-line bg-brand-soft px-1.5 py-0.5 align-baseline font-semibold text-brand-strong"
                            >
                              {gap.attr} {Math.ceil(gap.diff)}
                            </span>
                          ) : (
                            <GapCourseHint gap={gap} />
                          )}
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
  notice, signed, groups, artists,
}: {
  notice: CaseNotice;
  signed: SignedArtist[];
  groups: GroupRecord[];
  artists: ArtistStats[];
}) {
  const closing = notice.status === 'closing';
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
        {notice.workDays > 0 && (
          <div
            data-case-workdays
            title={`拍摄期共 ${notice.execDays} 天，其中需要工作 ${notice.workDays} 天，每周最多排 ${notice.daysPerWeek} 天`}
            className="mt-1 inline-flex flex-wrap items-center gap-1 rounded-ui-md bg-brand-soft px-1.5 py-0.5 text-ui-2xs font-semibold text-brand-strong"
          >
            工作 {notice.workDays} 天
            <span className="font-normal">每周 ≤{notice.daysPerWeek} 次</span>
          </div>
        )}
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

  const blankCells = (<><Td /><Td /><Td /><Td /><Td /></>);

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
          <Td className="text-ink-faint" colSpan={4}>存档里没有该通告的角色需求记录</Td>
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
            {index === 0 ? noticeCells : blankCells}
            <Td className={roleCell}>
              <RolePill role={role} />
            </Td>
            <Td className={roleCell}>
              <RequirementChips role={role} />
            </Td>
            <MatchList role={role} signed={signed} groups={groups} artists={artists} cellClass={roleCell} />
            {reservationCell(role, reserved)}
          </tr>
        );
      })}
    </tbody>
  );
}
