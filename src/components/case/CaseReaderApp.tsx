import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import EmptyState from '../EmptyState';
import { cn } from '../../lib/cn';
import {
  ATTRS, DEFAULT_RESERVATIONS, EMPTY_TABLES, NOTICE_COUNT_LABELS,
  canTakeRole, isGroupRole, matchGroupRole, matchRole, parseSave, toCsv,
  type ArtistOption, type ArtistStats, type CaseNotice, type CaseTables,
  type GroupRecord, type ParseResult, type RoleRecord,
} from '../../lib/caseParser';

const TABLES_URL = `${import.meta.env.BASE_URL}data/case-tables.json`;
const RESERVATION_KEY = 'case-reservations.v1';

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

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function chipClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-ui-2xs transition-colors',
    active
      ? 'border-brand bg-brand font-semibold text-white'
      : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
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
  const [reservations, setReservations] = useState<Record<string, string>>(
    () => readJson(RESERVATION_KEY, DEFAULT_RESERVATIONS),
  );
  const [editingRole, setEditingRole] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // A file can be dropped before the bundled tables finish loading. Keep the
  // freshest copies in refs so parseSave never joins against empty tables.
  const tablesRef = useRef(tables);
  tablesRef.current = tables;
  const reservationsRef = useRef(reservations);
  reservationsRef.current = reservations;
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
    setResult(parseSave(buffer, tablesRef.current, name, reservationsRef.current));
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
    lastBufferRef.current = null;
  }, []);

  const updateReservation = useCallback((roleCode: string, name: string) => {
    setReservations((previous) => {
      const next = { ...previous };
      if (name) next[roleCode] = name;
      else delete next[roleCode];
      window.localStorage.setItem(RESERVATION_KEY, JSON.stringify(next));
      reservationsRef.current = next;
      if (lastBufferRef.current && result) {
        setResult(parseSave(lastBufferRef.current, tablesRef.current, result.saveName, next));
      }
      return next;
    });
    setEditingRole('');
  }, [result]);

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

  /** Search, category and company are independent filters; results intersect. */
  const notices = useMemo(() => {
    if (!result) return [];
    const needle = query.trim().toLowerCase();
    return result.notices.filter((notice) => {
      if (filterCategory !== 'all' && notice.category !== filterCategory) return false;
      if (filterCompany !== 'all' && notice.company !== filterCompany) return false;
      if (!needle) return true;
      return [
        notice.code, notice.name, notice.category, notice.type, notice.company,
        ...notice.roles.map((role) => role.role),
      ].some((text) => text.toLowerCase().includes(needle));
    });
  }, [result, query, filterCategory, filterCompany]);

  const filterDirty = query.trim() !== '' || filterCategory !== 'all' || filterCompany !== 'all';
  const resetFilters = useCallback(() => {
    setQuery('');
    setFilterCategory('all');
    setFilterCompany('all');
  }, []);

  const requirementCount = result
    ? result.notices.reduce((sum, n) => sum + n.roles.reduce((s, r) => s + r.requirements.length, 0), 0)
    : 0;
  const closingCount = result?.notices.filter((n) => n.status === 'closing').length ?? 0;
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
        'fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto bg-canvas',
        dragging && 'ring-2 ring-inset ring-brand',
      )}
    >
      <div data-case-content className="mx-auto w-full max-w-[1600px] px-10 pt-3 pb-10 nav:px-5">
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
            {!tablesReady ? '准备中…' : result ? '换一个存档' : '选择 .sa2 存档'}
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

        {!result && !busy && !error && (
          <div className="mt-2 rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-2.5 text-ui-2xs text-ink-muted">
            把 <code className="rounded bg-surface px-1">.sa2</code> 存档拖到这里，或点上面的按钮选择。文件只在浏览器里读取。
          </div>
        )}
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

            {/* Fixed roster panel: every signed artist, collapsible like the
                company refresh timeline below. */}
            <details data-case-artists open className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5">
              <summary data-case-artists-summary className="cursor-pointer text-ui-xs font-bold text-brand-strong">
                我方艺人 · {signedArtists.length} 位
                <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                  {signedArtists.map((item) => item.option.name).join(' / ')}
                </span>
              </summary>
              <div
                data-case-artist-grid
                className="mt-2 grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))' }}
              >
                {signedArtists.length === 0 ? (
                  <p className="text-ui-2xs text-ink-faint">这份存档里没有识别到旗下艺人。</p>
                ) : signedArtists.map(({ option, artist }) => (
                  <ArtistCard key={option.id} option={option} artist={artist} />
                ))}
              </div>
            </details>

            {/* 我方团体：团体编码 / 人气 / 名气 / 通告数量从存档读取，
                成员与队长来自可编辑的默认值（见 caseParser 的 DEFAULT_GROUPS）。 */}
            {result.groups.length > 0 && (
              <details data-case-groups open className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5">
                <summary data-case-groups-summary className="cursor-pointer text-ui-xs font-bold text-brand-strong">
                  我方团体 · {result.groups.length} 个
                  <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                    {result.groups.map((group) => group.name).join(' / ')}
                  </span>
                </summary>
                <div
                  data-case-group-grid
                  className="mt-2 grid gap-2"
                  style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
                >
                  {result.groups.map((group) => (
                    <div
                      key={group.code}
                      data-case-group
                      data-case-group-code={group.code}
                      className="rounded-ui-md border border-line bg-surface px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-ui-xs font-semibold text-ink">{group.name}</span>
                        <span className="rounded-full bg-brand px-2 py-0.5 text-ui-2xs font-semibold text-white">
                          团体编码 {group.code}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-ui-2xs text-ink-muted">
                        <span data-case-group-renqi>团体人气 <b className="text-ink">{group.renqi}</b></span>
                        <span data-case-group-mingqi>团体名气 <b className="text-ink">{group.mingqi}</b></span>
                        <span data-case-group-count>团体通告数量 <b className="text-ink">{group.noticeCount}</b></span>
                      </div>
                      <div className="mt-1.5 text-ui-2xs text-ink-muted">
                        队长
                        <b className="ml-1 text-brand-strong" data-case-group-leader>{group.leaderName}</b>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {group.memberNames.map((name, idx) => (
                          <span
                            key={`${name}-${idx}`}
                            data-case-group-member
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-ui-2xs',
                              name === group.leaderName
                                ? 'border-brand bg-brand-soft font-semibold text-brand-strong'
                                : 'border-line bg-surface-soft text-ink-muted',
                            )}
                          >
                            {name}
                            {name === group.leaderName && <span className="text-[10px]">队长</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* 各公司周一更新批次：只列存档已排定的，不外推下下周。 */}
            <details data-case-updates className="mt-2 rounded-ui-md border border-line bg-surface px-3 py-2 text-ui-2xs">
              <summary className="cursor-pointer font-semibold text-brand-strong">
                制作公司更新节奏 · 已排定 {result.batches.length} 批
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
          result.notices.length === 0 ? (
            <div className="mt-2">
              <EmptyState title="这份存档里没有当期通告" text="CaseFirm 段没有登记任何通告编号。换一份游戏进行中的存档再试。" />
            </div>
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
                        <Th className="w-[8%]">类型</Th>
                        <Th className="w-[8%]">制作公司</Th>
                        <Th className="w-[11%]">接取时间</Th>
                        <Th className="w-[11%]">执行期间</Th>
                        <Th className="w-[7%]">角色</Th>
                        <Th className="w-[7%]">难度</Th>
                        <Th className="w-[15%]">所需数值</Th>
                        <Th className="w-[13%]" dataAttrs={{ 'data-case-match-col': 'yes' }}>数值对比</Th>
                        <Th className="w-[9%]">预约</Th>
                      </tr>
                    </thead>
                    {notices.map((notice) => (
                      <NoticeRows
                        key={`${notice.code}-${notice.firmSlot}`}
                        notice={notice}
                        signed={signedArtists}
                        groups={result.groups}
                        artists={artists}
                        roster={result.roster.map((r) => r.name).filter(Boolean)}
                        editingRole={editingRole}
                        setEditingRole={setEditingRole}
                        updateReservation={updateReservation}
                      />
                    ))}
                  </table>
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
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
        {artist && <span className="ml-auto text-ui-2xs text-ink-faint">{artist.condition}</span>}
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
            压力 {artist.stress} · 疲劳 {artist.fatigue} · 叛逆 {artist.social[0]} · 性感 {artist.social[1]} · 亲和 {artist.social[2]} · 人气 {artist.social[3]} · 曝光 {artist.social[4]} · 礼物 {artist.gifts}
          </div>
          <div data-case-artist-counts className="mt-0.5 flex flex-wrap gap-1 text-ui-2xs">
            <span className="text-ink-faint">通告统计</span>
            {NOTICE_COUNT_LABELS.map((label, i) => (
              <span key={label} className="rounded bg-surface-soft px-1 text-ink-muted">
                {label} <b>{artist.noticeCounts[i]}</b>
              </span>
            ))}
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

function Td({ children, className, title, colSpan, dataAttrs }: {
  children?: ReactNode;
  className?: string;
  title?: string;
  colSpan?: number;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <td title={title} colSpan={colSpan} {...dataAttrs} className={cn('border-b border-line px-3 py-2 align-top', className)}>
      {children}
    </td>
  );
}

function starText(star: number): string {
  return '★'.repeat(star) + '☆'.repeat(Math.max(0, 5 - star));
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
          title={`${req.attr} ${req.value}，静态等级 ${req.staticGrade || '未标注'}`}
          className="inline-flex items-baseline gap-1 whitespace-nowrap rounded-full border border-line-strong bg-surface px-2 py-0.5 text-ui-2xs text-ink-muted"
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
  const rows = groupRole
    ? groups.map((group) => {
        const leader = artists.find((a) => a.roleId === group.leaderId) ?? null;
        return {
          key: `group-${group.code}`,
          match: matchGroupRole(role, leader, group.name, group.leaderName),
        };
      })
    : signed
      .filter((item) => item.artist && canTakeRole(role, item.option.gender))
      .map((item) => ({
        key: `artist-${item.option.id}`,
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
          {rows.map(({ key, match }) => (
            <div
              key={key}
              data-case-match
              data-case-match-group={groupRole ? 'yes' : undefined}
              data-match-artist={match.artistName}
              data-match-result={match.canAccept ? 'yes' : 'no'}
              className={cn(
                'flex items-center gap-1 text-ui-2xs leading-[1.4]',
                match.canAccept ? 'font-semibold' : 'text-alert',
              )}
            >
              {match.canAccept ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-growth px-1.5 py-0.5 text-white">
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="h-2.5 w-2.5">
                    <path d="M2.5 6.2 4.8 8.5 9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <b>{match.artistName}</b> 可以接
                </span>
              ) : (
                <span>
                  <b>{match.artistName}</b>{' '}
                  差 {match.gaps.filter((gap) => gap.diff > 0).map((gap) => `${gap.attr} ${gap.diff}`).join(' · ')}
                </span>
              )}
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
  notice, signed, groups, artists, roster, editingRole, setEditingRole, updateReservation,
}: {
  notice: CaseNotice;
  signed: SignedArtist[];
  groups: GroupRecord[];
  artists: ArtistStats[];
  roster: string[];
  editingRole: string;
  setEditingRole: (value: string) => void;
  updateReservation: (roleCode: string, name: string) => void;
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
          <span className="mt-1 inline-block rounded-full bg-surface-soft px-1.5 py-0.5 text-ui-2xs text-ink-faint">
            尚未开放
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
      <Td title="通告执行期间">
        <div className="text-ui-2xs leading-[1.7]">
          <div className="whitespace-nowrap">起 <b className="text-ink-muted">{notice.periodStart || '—'}</b></div>
          <div className="whitespace-nowrap">止 <b className="text-ink-muted">{notice.periodEnd || '—'}</b></div>
          <div className="text-ink-faint">共 {notice.execDays} 天</div>
        </div>
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

  const reservationCell = (role: RoleRecord, reserved: boolean) => (
    <Td className={reserved ? 'bg-surface-soft text-ink-faint' : undefined}>
      {editingRole === role.roleCode ? (
        <select
          autoFocus
          aria-label="设置预约艺人"
          data-case-reservation-select
          value={role.reservedBy}
          onChange={(event) => updateReservation(role.roleCode, event.target.value)}
          onBlur={() => setEditingRole('')}
          className="w-full rounded border border-line bg-surface px-1 py-0.5 text-ui-2xs outline-none"
        >
          <option value="">（空）</option>
          {['黎华', ...roster.filter((name) => name !== '黎华' && name !== '黎華')].map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          data-case-reservation
          onClick={() => setEditingRole(role.roleCode)}
          title="点击修改预约艺人"
          className="whitespace-nowrap text-left text-ui-2xs"
        >
          {role.reservedBy ? (
            <span className="font-semibold text-brand-strong">{role.reservedBy}（已预约）</span>
          ) : (
            <span className="text-ink-faint">—</span>
          )}
        </button>
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
              <span className="font-semibold">{role.role}</span>
              <span className="ml-1 text-ui-2xs text-ink-faint" title={role.roleCode}>{role.roleCode.slice(-1)}</span>
            </Td>
            <Td className={cn('whitespace-nowrap text-gold', roleCell)} title={`难度 ${role.star} 星`}>
              {starText(role.star)}
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
