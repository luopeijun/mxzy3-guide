import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import EmptyState from '../EmptyState';
import { cn } from '../../lib/cn';
import {
  ATTRS, DEFAULT_RESERVATIONS, EMPTY_TABLES, NOTICE_COUNT_LABELS,
  matchRole, parseSave, toCsv,
  type ArtistStats, type CaseNotice, type CaseTables, type ParseResult, type RoleRecord,
} from '../../lib/caseParser';

const TABLES_URL = `${import.meta.env.BASE_URL}data/case-tables.json`;
const RESERVATION_KEY = 'case-reservations.v1';
const ARTIST_MAP_KEY = 'case-artist-map.v1';
const DEFAULT_ARTIST_NAMES = ['路风', '路敏', '萧依莉'];

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

interface ArtistBinding { name: string; index: number }

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

/** 当期通告数值：把 .sa2 存档拖进来，在浏览器里直接解出本局实抽的能力门槛。
 *  文件不会上传到任何服务器；读进内存的就是一份快照，游戏随后覆盖自动存档
 *  也不会影响页面上的结果。名称 / 等级 / 区间来自随站点打包的静态表。 */
export default function CaseReaderApp() {
  const [tables, setTables] = useState<CaseTables>(EMPTY_TABLES);
  const [tablesReady, setTablesReady] = useState(false);
  const [tablesError, setTablesError] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [reservations, setReservations] = useState<Record<string, string>>(
    () => readJson(RESERVATION_KEY, DEFAULT_RESERVATIONS),
  );
  const [bindings, setBindings] = useState<ArtistBinding[]>(
    () => readJson(ARTIST_MAP_KEY, DEFAULT_ARTIST_NAMES.map((name, i) => ({ name, index: i + 1 }))),
  );
  const [compareIndex, setCompareIndex] = useState(0);
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

  const updateBinding = useCallback((slot: number, patch: Partial<ArtistBinding>) => {
    setBindings((previous) => {
      const next = previous.map((item, i) => (i === slot ? { ...item, ...patch } : item));
      window.localStorage.setItem(ARTIST_MAP_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const notices = useMemo(() => {
    if (!result) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return result.notices;
    return result.notices.filter((notice) => [
      notice.code, notice.name, notice.category, notice.type, notice.company,
      ...notice.roles.map((role) => role.role),
    ].some((text) => text.toLowerCase().includes(needle)));
  }, [result, query]);

  const requirementCount = result
    ? result.notices.reduce((sum, n) => sum + n.roles.reduce((s, r) => s + r.requirements.length, 0), 0)
    : 0;
  const closingCount = result?.notices.filter((n) => n.status === 'closing').length ?? 0;
  const artists = result?.artists ?? [];
  const compareBinding = bindings[compareIndex] ?? bindings[0];
  const compareArtist = artists.find((a) => a.index === compareBinding?.index) ?? null;

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
      <div className="mx-auto max-w-[1240px] px-6 pt-3 pb-10 nav:px-3">
        {/* One compact toolbar: the upload control must not push the table down. */}
        <div className="flex flex-wrap items-center gap-2 rounded-ui-md border border-line bg-surface px-3 py-2">
          <span className="text-ui-sm font-bold text-brand-strong">当期通告 · 所需数值</span>
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
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜名称 / 类型 / 角色"
              aria-label="筛选通告"
              className="w-[168px] rounded-full border border-line bg-surface-soft px-3 py-1.5 text-ui-2xs outline-none placeholder:text-ink-faint focus:border-brand-line phone:w-[120px]"
            />
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
          <div className="mt-2 rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-2.5 text-ui-2xs leading-[1.7] text-ink-muted">
            把 <code className="rounded bg-surface px-1">Save2</code> 里的 <code className="rounded bg-surface px-1">.sa2</code> 存档拖到页面上，或点上面的按钮选择。文件只在浏览器里读取，不会上传；游戏随后覆盖自动存档也不影响这里的快照。
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

            {/* 我方艺人：用一个框和下面的通告表区分开。 */}
            <section
              data-case-artists
              className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-ui-xs font-bold text-brand-strong">我方艺人</h2>
                <span className="text-ui-2xs text-ink-faint">基本属性 + 通告统计，来自存档内的艺人状态块</span>
                <span className="ml-auto flex items-center gap-1 text-ui-2xs text-ink-muted">
                  数值对比
                  <select
                    aria-label="选一位艺人做数值对比"
                    value={compareIndex}
                    onChange={(event) => setCompareIndex(Number(event.target.value))}
                    className="rounded border border-line bg-surface px-1.5 py-0.5 text-ui-2xs outline-none"
                  >
                    {bindings.map((binding, i) => (
                      <option key={i} value={i}>{binding.name || `艺人 ${i + 1}`}</option>
                    ))}
                    <option value={-1}>不对比</option>
                  </select>
                </span>
              </div>
              {artists.length === 0 ? (
                <p className="text-ui-2xs text-ink-faint">这份存档里没有找到艺人状态块。</p>
              ) : (
                <div data-case-artist-grid className="grid grid-cols-3 gap-2 tab:grid-cols-1">
                  {bindings.map((binding, slot) => {
                    const artist = artists.find((a) => a.index === binding.index) ?? artists[Math.min(slot, artists.length - 1)];
                    return (
                      <ArtistCard
                        key={slot}
                        binding={binding}
                        artist={artist}
                        artists={artists}
                        onName={(name) => updateBinding(slot, { name })}
                        onIndex={(index) => updateBinding(slot, { index })}
                      />
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-ui-2xs leading-[1.6] text-ink-faint">
                存档没有把状态块和艺人名写在一起，所以默认按前三个状态块对应你签约的三位。点开「状态块」下拉可以按游戏里的演技数值找到对应的那一位，名字也能直接改；选择会记在本机。
              </p>
            </section>

            {/* 各公司周一更新批次，含已排定与推测。 */}
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
                {result.forecastDate && (
                  <span className="rounded border border-dashed border-line-strong px-2 py-1 leading-[1.5] text-ink-faint">
                    <b>约 {result.forecastDate} 周一</b>
                    <br />
                    推测：按每周一更新推算，这批通告还没写进存档，公司需进游戏确认
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-ui-2xs text-ink-faint">
                上面每一批的日期和制作公司都直接读自存档里已排定的通告；只有虚线那批是按「每周一更新」外推的。
              </p>
            </details>
          </>
        )}

        {result && !busy && (
          result.notices.length === 0 ? (
            <div className="mt-2">
              <EmptyState title="这份存档里没有当期通告" text="CaseFirm 段没有登记任何通告编号。换一份游戏进行中的存档再试。" />
            </div>
          ) : notices.length === 0 ? (
            <div className="mt-2">
              <EmptyState title="没有匹配的通告" text={`没有找到包含「${query}」的通告，换个关键词试试。`} />
            </div>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-ui-md border border-line bg-surface">
              <table className="w-full min-w-[1180px] border-collapse text-ui-xs">
                <thead>
                  <tr className="bg-surface-soft text-left text-ui-2xs font-semibold text-ink-muted">
                    <Th className="w-[12%]">通告</Th>
                    <Th className="w-[9%]">类型</Th>
                    <Th className="w-[9%]">制作公司</Th>
                    <Th className="w-[13%]">接取时间</Th>
                    <Th className="w-[14%]">执行期间</Th>
                    <Th className="w-[6%]">角色</Th>
                    <Th className="w-[6%]">难度</Th>
                    <Th className="w-[21%]">所需数值 / 艺人匹配</Th>
                    <Th className="w-[10%]">预约</Th>
                  </tr>
                </thead>
                {notices.map((notice) => (
                  <NoticeRows
                    key={`${notice.code}-${notice.firmSlot}`}
                    notice={notice}
                    compareArtist={compareIndex >= 0 ? compareArtist : null}
                    compareName={compareBinding?.name ?? ''}
                    roster={result.roster.map((r) => r.name).filter(Boolean)}
                    editingRole={editingRole}
                    setEditingRole={setEditingRole}
                    updateReservation={updateReservation}
                  />
                ))}
              </table>
            </div>
          )
        )}

        <details className="mt-3 rounded-ui-md border border-line bg-surface-soft px-3 py-2 text-ui-2xs text-ink-muted">
          <summary className="cursor-pointer font-semibold text-brand-strong">字段说明与数值来源</summary>
          <ul className="mt-2 space-y-1 pl-5 leading-[1.8] list-disc">
            <li><b>游戏时间</b>读自存档头部的 [年, 月, 日, 星期] 四元组；所有倒计时都用它算，而不是电脑当前时间。</li>
            <li>每条通告在存档里有三个日期：<b>开放接取</b>（周一）、<b>执行开始</b>（周一）、<b>执行结束</b>（周日）。<b>停止接取</b>按你说的规则反推为执行开始的前一天，正好是周日。「7 天内停止接取」的行会高亮。</li>
            <li><b>执行期间</b>给出起止日期和总天数；若游戏时间已落在期间内，会显示已执行 / 剩余天数。但存档里没有找到「哪位艺人当前挂着哪条通告」的可靠字段，所以这一栏是<b>通告本身</b>的进度，不是某个艺人的档期。</li>
            <li><b>更新节奏</b>来自存档内所有已排定通告的开放接取日，按周一成批分组，制作公司名来自内置静态表。虚线那一批是按「每周一更新」外推的推测值。</li>
            <li>「类型」按通告编号前缀区分大类（CD 唱片 / CF 广告 / MV 电影 / TV 电视剧 / SH 主持），下方小字是静态表里的细分节目类型。</li>
            <li>静态表只给区间（如三星 A 是 420–480），具体门槛是开局随机抽定后写进存档的，所以只改数值的修改器读不到。存档 <code>Case</code> 段里每条角色记录存着本局实抽的具体值，<code>CaseFirm</code> 段列出当期登记的通告编号。</li>
            <li>数值按 演技 / 口才 / 歌艺 / 名气 / 仪态 / 动感 / 体能 / 才智 / 自信 九项排列；难度为星级 1–5。数字后的字母是静态能力等级（难度区间彼此重叠，以静态等级为准）。</li>
            <li><b>艺人匹配</b>用上方选中的艺人的九项能力逐项对照门槛，绿色表示能接，橙色列出还差多少。</li>
            <li><b>预约</b>：存档里没有定位到通用的预约艺人字段，默认按你核对过的两条（守候 / 背叛的男主角被黎华预约）标注；点格子可以改成别的艺人或清空，改动会记在本机。</li>
            <li>内置静态表来源：{tables.source || '未加载'}；版本不同时编号可能匹配不上名称，但数值依然可用。</li>
            {result && (
              <li>本次快照：{result.saveName} · {result.saveSize.toLocaleString('zh-CN')} 字节 · 读取时间 {result.readAt} · 存档内共 {result.roleRecordCount} 条角色记录 / {result.artists.length} 个艺人状态块。</li>
            )}
          </ul>
        </details>
      </div>
    </div>
  );
}

function ArtistCard({
  binding, artist, artists, onName, onIndex,
}: {
  binding: ArtistBinding;
  artist: ArtistStats | null;
  artists: ArtistStats[];
  onName: (name: string) => void;
  onIndex: (index: number) => void;
}) {
  return (
    <div data-case-artist className="rounded border border-line bg-surface px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <input
          value={binding.name}
          onChange={(event) => onName(event.target.value)}
          aria-label="艺人名字"
          className="w-[76px] rounded border border-line bg-surface-soft px-1.5 py-0.5 text-ui-xs font-bold text-brand-strong outline-none focus:border-brand-line"
        />
        <select
          value={artist?.index ?? binding.index}
          onChange={(event) => onIndex(Number(event.target.value))}
          aria-label="数值来源状态块"
          className="ml-auto rounded border border-line bg-surface-soft px-1 py-0.5 text-ui-2xs text-ink-muted outline-none"
        >
          {artists.map((item) => (
            <option key={item.index} value={item.index}>
              状态块 #{item.index} · 演技 {item.abilities[0]}
            </option>
          ))}
        </select>
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
            压力 {artist.stress} · 疲劳 {artist.fatigue} · 叛逆 {artist.social[0]} · 性感 {artist.social[1]} · 亲和 {artist.social[2]} · 人气 {artist.social[3]} · 曝光 {artist.social[4]} · 礼物 {artist.gifts} · {artist.condition}
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
        <p className="mt-1 text-ui-2xs text-ink-faint">没有读到状态块</p>
      )}
    </div>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn('border-b border-line px-3 py-2 font-semibold', className)}>{children}</th>;
}

function Td({ children, className, rowSpan, colSpan, title }: {
  children: ReactNode;
  className?: string;
  rowSpan?: number;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td rowSpan={rowSpan} colSpan={colSpan} title={title} className={cn('border-b border-line px-3 py-2 align-top', className)}>
      {children}
    </td>
  );
}

function starText(star: number): string {
  return '★'.repeat(star) + '☆'.repeat(Math.max(0, 5 - star));
}

function RequirementChips({
  role, compareArtist, compareName,
}: {
  role: RoleRecord;
  compareArtist: ArtistStats | null;
  compareName: string;
}) {
  const match = compareArtist ? matchRole(role, compareArtist, compareName) : null;
  if (role.requirements.length === 0) return <span className="text-ui-2xs text-ink-faint">无能力要求</span>;
  return (
    <>
      <div className="flex flex-wrap gap-1" data-case-match={match ? (match.canAccept ? 'yes' : 'no') : undefined}>
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
      {match && (
        <div className={cn('mt-1 text-ui-2xs leading-[1.5]', match.canAccept ? 'text-tag-follow' : 'text-alert')}>
          {match.canAccept ? (
            <span>✓ {match.artistName} 全部达标，可以接</span>
          ) : (
            <span>
              {match.artistName} 还差{' '}
              {match.gaps.filter((gap) => gap.diff > 0).map((gap) => `${gap.attr} ${gap.diff}`).join(' · ')}
            </span>
          )}
        </div>
      )}
    </>
  );
}

/** One <tbody> per notice so the notice-level cells can use rowspan, while the
 *  DOM still exposes one `[data-case-notice]` node per notice for regressions. */
function NoticeRows({
  notice, compareArtist, compareName, roster, editingRole, setEditingRole, updateReservation,
}: {
  notice: CaseNotice;
  compareArtist: ArtistStats | null;
  compareName: string;
  roster: string[];
  editingRole: string;
  setEditingRole: (value: string) => void;
  updateReservation: (roleCode: string, name: string) => void;
}) {
  const rows = notice.roles.length || 1;
  const closing = notice.status === 'closing';
  const noticeCells = (
    <>
      <Td rowSpan={rows} className="border-t border-line-strong">
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
      <Td rowSpan={rows} className="border-t border-line-strong">
        <span className={cn(
          'inline-block rounded-full px-2 py-0.5 text-ui-2xs font-semibold',
          CATEGORY_CLASS[notice.category] ?? 'bg-surface-soft text-ink-muted',
        )}>
          {notice.category}
        </span>
        {notice.type && <div className="mt-1 text-ui-2xs text-ink-faint">{notice.type}</div>}
      </Td>
      <Td rowSpan={rows} className="border-t border-line-strong">{notice.company || '—'}</Td>
      <Td rowSpan={rows} className="border-t border-line-strong" title="开放接取与停止接取">
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
      <Td rowSpan={rows} className="border-t border-line-strong" title="通告执行期间">
        <div className="whitespace-nowrap text-ui-2xs leading-[1.7]">
          <div><b className="text-ink-muted">{notice.periodStart || '—'}</b> <span className="text-ink-faint">~</span> <b className="text-ink-muted">{notice.periodEnd || '—'}</b></div>
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

  const reservationCell = (role: RoleRecord) => (
    <Td className="border-t border-line-strong">
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
        <tr data-case-role className="hover:bg-surface-soft">
          {noticeCells}
          <Td className="border-t border-line-strong text-ink-faint" colSpan={3}>存档里没有该通告的角色需求记录</Td>
          <Td className="border-t border-line-strong text-ink-faint">—</Td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody data-case-notice data-case-status={notice.status}>
      {notice.roles.map((role, index) => {
        const reserved = Boolean(role.reservedBy);
        return (
          <tr
            key={role.roleCode + role.offset}
            data-case-role
            data-case-reserved={reserved ? 'yes' : 'no'}
            className={cn(
              'hover:bg-surface-soft',
              reserved && 'bg-surface-soft text-ink-faint opacity-60',
              closing && !reserved && 'bg-alert-soft',
            )}
          >
            {index === 0 && noticeCells}
            <Td className={index === 0 ? 'border-t border-line-strong' : undefined}>
              <span className="font-semibold">{role.role}</span>
              <span className="ml-1 text-ui-2xs text-ink-faint" title={role.roleCode}>{role.roleCode.slice(-1)}</span>
            </Td>
            <Td className={cn('whitespace-nowrap text-gold', index === 0 && 'border-t border-line-strong')} title={`难度 ${role.star} 星`}>
              {starText(role.star)}
            </Td>
            <Td className={index === 0 ? 'border-t border-line-strong' : undefined}>
              <RequirementChips role={role} compareArtist={compareArtist} compareName={compareName} />
            </Td>
            {reservationCell(role)}
          </tr>
        );
      })}
    </tbody>
  );
}
