import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import type { TitleMeta } from '../lib/caseParser';
import { nextTitle } from '../lib/titleLadder';
import {
  formatSweetDate, parseSweetSave, shootableDays, sweetRiskOf, sweetRoleGender,
  SWEET_ABILITY_LABELS, SWEET_NOTICE_LABELS,
  type SweetAward, type SweetArtistCard, type SweetCaseTables, type SweetDoneNotice, type SweetEvent,
  type SweetNotice, type SweetNoticeRole, type SweetOwnedItem, type SweetPromoNotice, type SweetSave,
  type SweetSelfMadeNotice, type SweetSelfMadeStatus,
  type SweetShootingCast, type SweetShootingNotice, type SweetShootingOtherCast, type SweetShootingRisk, type SweetTeam,
  type SweetWaitingNotice, type SweetWorkRecord,
} from '../lib/sweetCaseParser';
import { companyDot, companyText } from '../components/notices/infoStyle';
import EmptyState from '../components/EmptyState';
import { TitleBadge } from '../ui/TitleBadge';
import { GapCourseHint, itemHintsFor } from '../ui/GapCourseHint';

/** 称号门槛走甜蜜乐章自己的 Nickname.dat：作品统计八项同序（唱片＝专辑、主持＝节目），
 *  作品总数是八项之和；奖项编号 21..53 与主站同套。演唱会已写进称号表，
 *  不再叠加攻略 PS 的活动条件，但记录仍留着给活动展示用。 */
function sweetTitleStats(save: SweetSave, artist: SweetArtistCard) {
  const awardIds = save.awards
    .filter((award) => award.artistId === artist.id)
    .map((award) => award.awardId);
  const concerts = save.events.filter((event) => {
    if (event.kind !== 63) return false;
    if (!event.group) return event.artistId === artist.id;
    return save.teams.some((team) =>
      team.memberIds.includes(event.artistId) && team.memberIds.includes(artist.id));
  }).length;
  return {
    abilities: artist.abilities,
    social: artist.social,
    noticeCounts: artist.noticeCounts,
    totalWorks: artist.noticeCounts.reduce((sum, value) => sum + value, 0),
    awardIds,
    concerts,
    skipConcertExtra: true,
  };
}

/** 甜站艺人编号与主站不同，性别从当前称号的性别位推；通用称号不过滤候选。 */
function sweetTitleGender(meta: TitleMeta | null): string | undefined {
  return meta?.sex === 1 ? 'male' : meta?.sex === 0 ? 'female' : undefined;
}

/** 得奖表里也有 NPC 的奖；页面只显示本公司的，和游戏排行榜筛选一致。 */
function awardBelongsToCompany(award: SweetAward, company: string): boolean {
  return award.company && !award.group
    && (award.winner === company || award.winner.includes(company));
}

/** 存档里主角名可能是全名「駱佩君」，得奖记录里写作「佩君」。 */
function awardBelongsTo(award: SweetAward, name: string): boolean {
  return !award.company && !award.group
    && (award.winner === name || award.winner.includes(name) || name.includes(award.winner));
}

/** 团体奖按记事内嵌团名或挂名艺人归到所属团体，不进个人 / 公司卡。 */
function awardBelongsToGroup(award: SweetAward, team: SweetTeam): boolean {
  return award.group
    && (award.winner === team.name || award.winner.includes(team.name) || team.memberIds.includes(award.artistId));
}

/** 个人场按艺人编号挂卡；团体场只在团体卡显示。 */
function eventBelongsToArtist(event: SweetEvent, artistId: number): boolean {
  return !event.group && event.artistId === artistId;
}

function eventBelongsToGroup(event: SweetEvent, team: SweetTeam): boolean {
  return event.group
    && (event.groupName === team.name || event.groupName.includes(team.name) || team.memberIds.includes(event.artistId));
}

/** 与主站 CATEGORY_CLASS 同一套通告类别色，筹备中表格直接沿用。 */
const SWEET_CATEGORY_CLASS: Record<string, string> = {
  唱片: 'bg-tag-talk-soft text-tag-talk',
  广告: 'bg-tag-follow-soft text-tag-follow',
  电影: 'bg-tag-manual-soft text-tag-manual',
  电视剧: 'bg-tag-news-soft text-tag-news',
  主持: 'bg-tag-scene-soft text-tag-scene',
  时装秀: 'bg-tag-runway-soft text-tag-runway',
  舞台剧: 'bg-tag-stage-soft text-tag-stage',
};

/** 右栏在拍小块用与表格同样的类别色；与主站 ACTIVE_NOTICE_TILE_CLASS 对齐。 */
const SWEET_ACTIVE_TILE_CLASS: Record<string, string> = {
  唱片: 'border-l-tag-talk bg-tag-talk-soft/70',
  广告: 'border-l-tag-follow bg-tag-follow-soft/70',
  电影: 'border-l-tag-manual bg-tag-manual-soft/70',
  电视剧: 'border-l-tag-news bg-tag-news-soft/70',
  主持: 'border-l-tag-scene bg-tag-scene-soft/70',
  时装秀: 'border-l-tag-runway bg-tag-runway-soft/70',
  舞台剧: 'border-l-tag-stage bg-tag-stage-soft/70',
};

/** 挂在右栏艺人名下的在拍通告：拍摄中与自制通告里明确还在拍的那一条。 */
interface SweetActiveNotice {
  key: string;
  source: 'shooting' | 'selfMade';
  code: string;
  name: string;
  category: string;
  startDate: string;
  endDate: string;
  doneDays: number;
  workDays: number;
  risk: SweetShootingRisk;
  groupName?: string;
}

/** 把存档里的在拍记录按艺人展开；团体通告只算一块，进度用队长那份。 */
function buildSweetActiveNotices(save: SweetSave): Map<number, SweetActiveNotice[]> {
  const byArtist = new Map<number, SweetActiveNotice[]>();
  const signedIds = new Set(save.artists.map((artist) => artist.id));
  const groupOf = (artistId: number): SweetTeam | null =>
    save.teams.find((team) => team.memberIds.includes(artistId)) ?? null;
  const add = (artistId: number, notice: SweetActiveNotice) => {
    if (!signedIds.has(artistId)) return;
    const list = byArtist.get(artistId) ?? [];
    if (list.some((item) => item.key === notice.key)) return;
    list.push(notice);
    byArtist.set(artistId, list);
  };
  const isGroupRole = (role: SweetNoticeRole | null): boolean =>
    !!role && (role.roleType === 4 || role.role === '團體' || role.role === '团体');

  for (const notice of save.shooting) {
    const groupRole = notice.roles.some(isGroupRole);
    for (const cast of notice.casts) {
      if (cast.status === 'done') continue;
      const group = groupRole ? groupOf(cast.artistId) : null;
      const targets = group ? group.memberIds : [cast.artistId];
      const item: SweetActiveNotice = {
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

  for (const notice of save.selfMade) {
    if (notice.status !== 'shooting') continue;
    for (const cast of notice.casts) {
      if (!cast.mine && !cast.group) continue;
      const group = cast.group ? groupOf(cast.artistId) : null;
      const risk: SweetShootingRisk = cast.needDays > 0
        ? sweetRiskOf(
          cast.needDays,
          shootableDays(notice.daysLeft, notice.daysPerWeek),
          notice.daysPerWeek,
        )
        : 'ok';
      const item: SweetActiveNotice = {
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
      for (const id of (group ? group.memberIds : [cast.artistId])) add(id, item);
    }
  }
  return byArtist;
}

/** 右栏太窄，横滑小块只写月/日；完整日期留在悬停提示里。 */
function shortNoticeDate(date: string): string {
  const parts = date.split('/');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : (date || '—');
}

/** 每位艺人名下的在拍横滑条：左右箭头按一格滚动，轨道自身保留横向滚动条。 */
function SweetActiveNoticeStrip({ notices }: { notices: SweetActiveNotice[] }) {
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
    const tile = el.querySelector('[data-sweet-case-quickref-notice]') as HTMLElement | null;
    el.scrollBy({ left: direction * ((tile?.offsetWidth ?? 148) + 6), behavior: 'smooth' });
  };

  return (
    <div className="mt-1.5 border-t border-line pt-1" data-sweet-case-quickref-notice-strip>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-ui-2xs font-semibold text-ink-faint">
          在拍通告 <span className="tabular-nums">{notices.length}</span>
        </span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            data-sweet-case-quickref-scroll-prev
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
            data-sweet-case-quickref-scroll-next
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
        data-sweet-case-quickref-notice-scroll
        className="case-active-notice-scroll flex gap-1.5 overflow-x-auto pb-1.5"
      >
        {notices.map((item) => (
          <div
            key={item.key}
            data-sweet-case-quickref-notice={item.code}
            data-sweet-case-quickref-notice-source={item.source}
            data-sweet-case-quickref-notice-risk={item.risk}
            title={`${item.name}（${item.code}）${item.groupName ? ` · ${item.groupName}` : ''}\n${item.startDate || '—'} ~ ${item.endDate || '—'}`}
            className={cn(
              'relative w-[148px] shrink-0 rounded border border-line border-l-[3px] px-1.5 py-1',
              SWEET_ACTIVE_TILE_CLASS[item.category] ?? 'bg-surface',
            )}
          >
            <div className="flex items-center gap-1 pr-2">
              <span className={cn(
                'shrink-0 rounded px-1 text-ui-2xs',
                SWEET_CATEGORY_CLASS[item.category] ?? 'bg-surface text-ink-muted',
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
function SweetArtistQuickRef({ save }: { save: SweetSave }) {
  const [collapsed, setCollapsed] = useState(false);
  const activeNotices = useMemo(() => buildSweetActiveNotices(save), [save]);
  return (
    <section data-sweet-case-quickref className="flex min-h-0 flex-1 flex-col rounded-ui-md border border-line bg-surface p-2.5 shadow-soft">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-ui-2xs font-semibold text-ink-faint">艺人速查 · {save.artists.length} 位</span>
        <button
          type="button"
          data-sweet-case-quickref-toggle
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
          className="rounded px-1 text-ui-2xs text-ink-faint transition-colors hover:bg-surface-soft hover:text-brand-strong"
        >
          {collapsed ? '展开' : '收起'}
        </button>
      </div>
      {!collapsed && (
        <div data-sweet-case-quickref-list className="mt-1.5 min-h-0 space-y-1.5 overflow-y-auto pr-0.5">
          {save.artists.length === 0 ? (
            <p className="px-0.5 text-ui-2xs text-ink-faint">这份存档里没有识别到旗下艺人。</p>
          ) : save.artists.map((artist) => {
            const active = activeNotices.get(artist.id) ?? [];
            return (
              <div key={artist.id} data-sweet-case-quickref-artist={artist.name} className="rounded border border-line bg-surface-soft px-2 py-1.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-ui-2xs font-bold text-brand-strong">#{artist.id} {artist.name}</span>
                  <span
                    data-sweet-case-quickref-condition
                    className={cn(
                      'ml-auto text-ui-2xs',
                      artist.condition && artist.condition !== '正常'
                        ? 'font-semibold text-alert' : 'text-ink-faint',
                    )}
                  >
                    {artist.condition || '—'}
                  </span>
                </div>
                <div data-sweet-case-quickref-attrs className="mt-1 grid grid-cols-3 gap-x-1.5 gap-y-0.5 text-ui-2xs text-ink-muted">
                  {SWEET_ABILITY_LABELS.map((label, index) => (
                    <span key={label} className="flex justify-between gap-0.5 whitespace-nowrap">
                      <span className="text-ink-faint">{label}</span>
                      <b className="tabular-nums">{artist.abilities[index] ?? 0}</b>
                    </span>
                  ))}
                </div>
                <div className="mt-1 whitespace-nowrap border-t border-line pt-1 text-ui-2xs leading-[1.5] text-ink-faint">
                  叛逆 {artist.social[0]} · 性感 {artist.social[1]} · 亲和 {artist.social[2]}
                </div>
                {active.length > 0 && <SweetActiveNoticeStrip notices={active} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function sweetChipClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-ui-2xs transition-colors',
    active
      ? 'border-brand bg-brand font-semibold text-white'
      : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
  );
}

/** 通告统计的小胶囊 + 悬停作品清单，与主站 WorkCountChip 同一套样式和交互。 */
function SweetWorkCountChip({
  label, value, works, title, dataName, dataValue, dataNoticeIndex,
}: {
  label: string;
  value: number;
  works: readonly SweetWorkRecord[];
  title: string;
  dataName?: string;
  dataValue?: string;
  dataNoticeIndex?: number;
}) {
  return (
    <span className="work-count-chip group relative inline-flex">
      <span
        {...(dataName ? { [dataName]: dataValue ?? '' } : {})}
        data-notice-index={dataNoticeIndex}
        tabIndex={0}
        role="button"
        className="cursor-help rounded px-1 py-0.5 text-ink-faint outline-none transition-colors hover:bg-count-soft hover:text-ink focus-visible:bg-count-soft focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-brand-line"
      >
        {label} <b className="font-semibold text-ink">{value}</b>
      </span>
      {works.length > 0 && (
        <span
          data-sweet-case-works-card
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 w-[320px] pb-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        >
          <span className="block rounded-ui-sm border border-line bg-surface p-2 text-left shadow-lg">
            <span className="mb-1 flex items-baseline gap-1">
              <b className="text-ui-2xs text-ink">{title}</b>
              <span className="text-ui-2xs text-ink-faint">{works.length} 条（按发生顺序）</span>
            </span>
            <span
              data-sweet-case-works-scroll
              className="block max-h-[240px] overflow-y-auto overscroll-contain pr-1"
            >
              {works.map((work, index) => (
                <span
                  key={`${work.workCode}-${work.order}`}
                  data-sweet-case-artist-work
                  className="flex flex-wrap items-baseline gap-x-1 border-t border-line py-1 text-ui-2xs leading-[1.4]"
                >
                  <span className="shrink-0 font-semibold tabular-nums text-ink-muted">{index + 1}.</span>
                  {work.date && <span className="text-ink-faint">{work.date}</span>}
                  <span className={cn('font-semibold', work.workCode ? 'text-ink' : 'text-ink-faint')}>
                    {work.workName}
                  </span>
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

/** 通告状态页签：与主站 CaseReaderApp 的 tabClass 完全一致。 */
function sweetTabClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-t border-b-2 px-3 py-1.5 text-ui-xs transition-colors',
    active
      ? 'border-brand bg-surface font-bold text-brand-strong'
      : 'border-transparent text-ink-muted hover:text-brand-strong',
  );
}

interface SweetUpdateBatch {
  date: string;
  dayNumber: number;
  label: string;
  companies: string[];
  kinds: string[];
  codes: string[];
  daysAway: number;
}

/** 开放节奏只按页面列出的筹备中通告归并；日期是 YYYY/M/M/D，差值走 UTC 天数。 */
function sweetDayNumber(text: string): number | null {
  const [year, month, day] = text.split('/').map(Number);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function sweetUpdateInfo(save: SweetSave) {
  const today = Math.floor(Date.UTC(save.date.year, save.date.month - 1, save.date.day) / 86400000);
  const byDay = new Map<number, SweetUpdateBatch>();
  for (const notice of save.notices) {
    const dayNumber = sweetDayNumber(notice.openDate);
    if (dayNumber === null) continue;
    let batch = byDay.get(dayNumber);
    if (!batch) {
      const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(dayNumber * 86400000).getUTCDay()];
      batch = {
        date: notice.openDate, dayNumber, label: weekday,
        companies: [], kinds: [], codes: [], daysAway: dayNumber - today,
      };
      byDay.set(dayNumber, batch);
    }
    if (notice.company && !batch.companies.includes(notice.company)) batch.companies.push(notice.company);
    if (notice.category && !batch.kinds.includes(notice.category)) batch.kinds.push(notice.category);
    if (!batch.codes.includes(notice.code)) batch.codes.push(notice.code);
  }
  const batches = [...byDay.values()].sort((a, b) => a.dayNumber - b.dayNumber);
  return {
    closingCount: save.notices.filter((notice) => notice.status === 'closing').length,
    batches,
    nextUpdate: batches.find((batch) => batch.dayNumber > today) ?? null,
  };
}

/** 与明星志愿3 存档解析同款的小结块：右侧固定，默认收成一行，点开才列条目。 */
function SweetCaseToc({ save }: { save: SweetSave }) {
  const [active, setActive] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const updates = useMemo(() => sweetUpdateInfo(save), [save]);
  const entries = useMemo(() => [
    { id: 'clock', label: '游戏时间', selector: '[data-sweet-case-clock]', summary: formatSweetDate(save.date) },
    { id: 'company', label: '公司', selector: '[data-sweet-case-company]', summary: `主角 ${save.protagonist || '未记录'}` },
    { id: 'artists', label: '我方艺人', selector: '[data-sweet-case-artists]', summary: `${save.artists.length} 位` },
    { id: 'teams', label: '我方团体', selector: '[data-sweet-case-teams]', summary: `${save.teams.length} 个` },
    ...(save.items.some((it) => it.quantity > 0)
      ? [{
          id: 'items',
          label: '道具',
          selector: '[data-sweet-case-items]',
          summary: `${save.items.filter((it) => it.quantity > 0).length} 件`,
        }]
      : []),
    ...(save.scenes.length > 0
      ? [{
          id: 'scenes',
          label: '场景',
          selector: '[data-sweet-case-scenes]',
          summary: `${save.scenes.filter((s) => s.unlocked).length}/${save.scenes.length} 解锁`,
        }]
      : []),
    ...(save.producers.length > 0
      ? [{
          id: 'producers',
          label: '制作人好感',
          selector: '[data-sweet-case-producers]',
          summary: `${save.producers.filter((p) => save.producerFriendship[p.code] !== undefined).length} 位`,
        }]
      : []),
    { id: 'updates', label: '开放节奏', selector: '[data-sweet-case-updates]', summary: `归并 ${updates.batches.length} 批` },
    { id: 'notices', label: '筹备中通告', selector: '[data-sweet-case-notices]', summary: `${save.notices.length} 条` },
    { id: 'shooting', label: '拍摄中通告', selector: '[data-sweet-case-notices]', summary: `${save.shooting.length} 条` },
    { id: 'promo', label: '宣传中通告', selector: '[data-sweet-case-notices]', summary: `${save.promo.length} 条` },
    { id: 'waiting', label: '等待上市通告', selector: '[data-sweet-case-notices]', summary: `${save.waiting.length} 条` },
    { id: 'hot', label: '热卖中通告', selector: '[data-sweet-case-notices]', summary: `${save.hot.length} 条` },
    { id: 'done', label: '已完成通告', selector: '[data-sweet-case-notices]', summary: `${save.done.length} 条` },
  ], [save, updates.batches.length]);

  useEffect(() => {
    const root = document.querySelector('[data-sweet-case-scroll]');
    const observer = new IntersectionObserver(
      (obs) => {
        const visible = obs
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).getAttribute('data-sweet-case-toc-id');
          if (id) setActive(id);
        }
      },
      { root: root as Element | null, rootMargin: '-80px 0px -55% 0px', threshold: 0 },
    );
    entries.forEach((e) => {
      const t = document.querySelector(e.selector);
      if (t) {
        t.setAttribute('data-sweet-case-toc-id', e.id);
        observer.observe(t);
      }
    });
    return () => observer.disconnect();
  }, [entries, collapsed]);

  const jump = (entry: { id: string; selector: string }) => {
    const el = document.querySelector(entry.selector) as HTMLElement | null;
    if (!el) return;
    if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(entry.id);
  };

  return (
    <nav
      data-sweet-case-toc
      aria-label="本页小结"
      className="rounded-ui-md border border-line bg-surface p-2.5 shadow-soft"
    >
      <div className="flex items-center justify-between px-0.5">
        <span className="text-ui-2xs font-semibold text-ink-faint">本页小结</span>
        <button
          type="button"
          data-sweet-case-toc-toggle
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
                data-sweet-case-toc-link={e.id}
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

/** 公司信息里的一格：与主站 CompanyStat 同一套样式。 */
function SweetCaseStat({ label, value, attr, hint, alert }: {
  label: string; value: string; attr: string; hint?: string; alert?: boolean;
}) {
  return (
    <div
      data-sweet-case-company-stat={attr}
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

/** 与主站 moneyText 同一套：按亿/万拆开，不加千分位。 */
function sweetMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  let rest = Math.abs(Math.round(value));
  const yi = Math.floor(rest / 100000000);
  rest -= yi * 100000000;
  const wan = Math.floor(rest / 10000);
  rest -= wan * 10000;
  let out = '';
  if (yi) out += `${yi}亿`;
  if (wan) out += `${wan}万`;
  if (rest || !out) out += `${rest}`;
  return sign + out;
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
    <td title={title} colSpan={colSpan} rowSpan={rowSpan} {...dataAttrs} className={cn('border-b border-line px-3 py-2 align-top', className)}>
      {children}
    </td>
  );
}

/** 与主站筹备中表格同款的角色胶囊。 */
function SweetRolePill({ role }: { role: SweetNoticeRole }) {
  return (
    <span
      data-case-role-code={role.code}
      title={role.code}
      className="inline-flex items-baseline gap-1 whitespace-nowrap rounded-full border border-line-strong bg-surface px-2 py-0.5 text-ui-2xs text-ink-muted"
    >
      {role.role}
      <b className="text-ui-2xs text-brand-strong">{role.star}★</b>
    </span>
  );
}

function SweetRequirementChips({ role }: { role: SweetNoticeRole }) {
  if (role.requirements.length === 0) return <span className="text-ui-2xs text-ink-faint">无能力要求</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {role.requirements.map((req) => (
        <span
          key={req.attr}
          data-case-value
          title={`${req.attr} ${req.value}`}
          className="inline-flex items-baseline gap-1 whitespace-nowrap rounded-full border border-line-strong bg-surface px-2 py-0.5 text-ui-2xs text-ink-muted"
        >
          {req.attr}
          <b className="text-ui-xs text-brand-strong">{req.value}</b>
        </span>
      ))}
    </div>
  );
}

/** 存档里的能力值是 ×10 存的，差值可能出现 14.800000000000011 这种浮点噪声。 */
function formatGap(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

interface SweetMatch {
  artistName: string;
  canAccept: boolean;
  gaps: { attr: string; diff: number }[];
}

/** 与主站 isAcceptable 同口径：还没停止接取（open / closing）且至少有一个角色空着。 */
function sweetNoticeAcceptable(notice: SweetNotice): boolean {
  if (notice.status !== 'open' && notice.status !== 'closing') return false;
  return notice.roles.some((role) => !role.reservedBy);
}

function sweetMatchRole(
  role: SweetNoticeRole, artist: SweetArtistCard, genders: Record<string, number>,
): SweetMatch | null {
  const gender = genders[String(artist.id)];
  const need = sweetRoleGender(role.roleType);
  if (need === 'male' && gender !== undefined && gender !== 1) return null;
  if (need === 'female' && gender !== undefined && gender !== 0) return null;
  const gaps = role.requirements.map((req) => {
    const index = SWEET_ABILITY_LABELS.findIndex((label) => label === req.attr);
    const have = index >= 0 ? artist.abilities[index] ?? 0 : 0;
    // 艺人数值存档是 ×10，这里按同一精度四舍五入，避免 14.800000000000011。
    return { attr: req.attr, diff: Math.round((req.value - have) * 10) / 10 };
  });
  return {
    artistName: artist.name,
    canAccept: gaps.every((gap) => gap.diff <= 0),
    gaps: gaps.filter((gap) => gap.diff > 0),
  };
}

/** 数值对比合成一列、每位艺人一行；和主站一样绿色在上、缺口在下面。 */
function SweetMatchList({ role, save, genders }: {
  role: SweetNoticeRole;
  save: SweetSave;
  genders: Record<string, number>;
}) {
  const rows = save.artists
    .map((artist) => sweetMatchRole(role, artist, genders))
    .filter((row): row is SweetMatch => Boolean(row))
    .sort((a, b) => Number(b.canAccept) - Number(a.canAccept));
  // 缺口 hover 的训练 / 打工 / 道具提示与主站共用同一组件；甜站存档道具同构。
  const itemHints = useMemo(() => itemHintsFor(save.items), [save.items]);
  return (
    <Td className={role.reservedBy ? 'bg-surface-soft text-ink-faint opacity-60' : undefined} dataAttrs={undefined}>
      <div data-case-match-list className="flex flex-col gap-1">
        {rows.length === 0 ? (
          <span className="text-ui-2xs text-ink-faint">—</span>
        ) : rows.map((row) => (
          <div
            key={row.artistName}
            data-case-match
            data-match-artist={row.artistName}
            data-match-result={row.canAccept ? 'yes' : 'no'}
            className={cn(
              'flex items-start gap-1.5 text-ui-2xs leading-[1.5]',
              row.canAccept ? 'font-semibold' : 'text-alert',
            )}
          >
            <span className="shrink-0 select-none leading-[1.6] text-ink-faint" aria-hidden="true">•</span>
            <span className="min-w-0 flex-1">
              {row.canAccept ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-title-model-line bg-title-model-soft px-2 py-0.5 align-middle text-title-model">
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="h-2.5 w-2.5">
                    <path d="M2.5 6.2 4.8 8.5 9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <b>{row.artistName}</b> 可以接
                </span>
              ) : (
                <span>
                  <b>{row.artistName}</b> 差{' '}
                  {row.gaps.map((gap, index) => (
                    <span key={gap.attr}>
                      {index > 0 && ' · '}
                      <GapCourseHint
                        gap={gap}
                        itemHints={itemHints}
                        label={`${gap.attr} ${formatGap(gap.diff)}`}
                      />
                    </span>
                  ))}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Td>
  );
}

function SweetNoticeRows({ notice, save, genders }: {
  notice: SweetNotice;
  save: SweetSave;
  genders: Record<string, number>;
}) {
  const closing = notice.status === 'closing';
  const workDaysBadge = (role?: SweetNoticeRole) => {
    const workDays = role?.workDays ?? notice.roles[0]?.workDays ?? 0;
    const daysPerWeek = role?.daysPerWeek ?? notice.roles[0]?.daysPerWeek ?? 0;
    if (!workDays) return null;
    return (
      <div data-case-workdays data-case-work-days={workDays} className="mt-1 flex flex-wrap items-center gap-1">
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
        {notice.status === 'upcoming' && (
          <span className="mt-1 inline-block rounded-full bg-tag-follow-soft px-1.5 py-0.5 text-ui-2xs font-semibold text-tag-follow">
            下周更新
          </span>
        )}
        {notice.status === 'closing' && (
          <span className="mt-1 inline-block rounded-full bg-alert-soft px-1.5 py-0.5 text-ui-2xs font-semibold text-alert">
            即将截止
          </span>
        )}
      </Td>
      <Td>
        <span
          data-case-notice-category={notice.category}
          className={cn(
            'inline-block rounded-full px-2 py-0.5 text-ui-2xs font-semibold',
            SWEET_CATEGORY_CLASS[notice.category] ?? 'bg-surface-soft text-ink-muted',
          )}
        >
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
        {notice.daysToDeadline >= 0 && (
          <span className={cn(
            'mt-1 inline-block rounded-full px-1.5 py-0.5 text-ui-2xs',
            closing ? 'bg-alert-soft font-semibold text-alert' : 'bg-surface-soft text-ink-faint',
          )}>
            还剩 {notice.daysToDeadline} 天
          </span>
        )}
      </Td>
      <Td title="通告执行期间，以及每个角色自己的工作天数">
        <div className="text-ui-2xs leading-[1.7]">
          <div className="whitespace-nowrap">起 <b className="text-ink-muted">{notice.startDate || '—'}</b></div>
          <div className="whitespace-nowrap">止 <b className="text-ink-muted">{notice.endDate || '—'}</b></div>
        </div>
        {workDaysBadge(notice.roles[0])}
        {notice.daysToStart > 0 && (
          <span className="mt-1 inline-block rounded-full bg-surface-soft px-1.5 py-0.5 text-ui-2xs text-ink-faint">
            {notice.daysToStart} 天后开拍
          </span>
        )}
      </Td>
    </>
  );
  const blankCells = (role: SweetNoticeRole) => (
    <><Td /><Td /><Td /><Td /><Td>{workDaysBadge(role)}</Td></>
  );

  return (
    <tbody data-case-notice data-case-status={notice.status}>
      {notice.roles.length === 0 ? (
        <tr data-case-role className="border-t border-line-strong">
          {noticeCells}
          <Td className="text-ink-faint" colSpan={3}>存档里没有该通告的角色需求记录</Td>
          <Td className="text-ink-faint">—</Td>
        </tr>
      ) : notice.roles.map((role, index) => (
        <tr
          key={role.code}
          data-case-role
          data-case-role-name={role.role}
          data-case-reserved={role.reservedBy ? 'yes' : 'no'}
          className={cn('hover:bg-surface-soft', index === 0 && 'border-t border-line-strong')}
        >
          {index === 0 ? noticeCells : blankCells(role)}
          <Td className={role.reservedBy ? 'bg-surface-soft text-ink-faint opacity-60' : undefined}>
            <SweetRolePill role={role} />
          </Td>
          <Td className={role.reservedBy ? 'bg-surface-soft text-ink-faint opacity-60' : undefined}>
            <SweetRequirementChips role={role} />
          </Td>
          <SweetMatchList role={role} save={save} genders={genders} />
          <Td className={role.reservedBy ? 'bg-surface-soft' : undefined}>
            {role.reservedBy ? (
              <span data-case-reservation className="whitespace-nowrap text-ui-2xs font-semibold text-brand-strong">{role.reservedBy}</span>
            ) : <span className="text-ui-2xs text-ink-faint">—</span>}
          </Td>
        </tr>
      ))}
    </tbody>
  );
}

/** 筹备中通告：筛选条 + 主站同款九列表格，一个角色一行。 */
function SweetNoticePanel({ save, genders }: { save: SweetSave; genders: Record<string, number> }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [company, setCompany] = useState('all');
  const [takeFilter, setTakeFilter] = useState<'all' | 'slots' | 'qualified'>('all');
  const all = save.notices;
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    all.forEach((notice) => counts.set(notice.category, (counts.get(notice.category) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);
  const companies = useMemo(
    () => [...new Set(all.map((notice) => notice.company).filter(Boolean))].sort(),
    [all],
  );
  /** 「满足条件」与表格里同一列数值对比同口径：性别 + 九项能力全达标。
   *  甜蜜乐章角色记录没有社交门槛字段，所以只有这两项，别照搬主站社交判断。 */
  const fitsRole = useCallback((role: SweetNoticeRole) => (
    save.artists.some((artist) => sweetMatchRole(role, artist, genders)?.canAccept)
  ), [save.artists, genders]);
  // 两个接取标签的数字只按存档本身算，不受搜索 / 类型 / 公司影响。
  const slotCount = useMemo(() => all.filter(sweetNoticeAcceptable).length, [all]);
  const qualifiedCount = useMemo(
    () => all.filter((notice) => sweetNoticeAcceptable(notice)
      && notice.roles.some((role) => !role.reservedBy && fitsRole(role))).length,
    [all, fitsRole],
  );
  const notices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((notice) => {
      if (takeFilter === 'slots' && !sweetNoticeAcceptable(notice)) return false;
      if (takeFilter === 'qualified' && !(sweetNoticeAcceptable(notice)
        && notice.roles.some((role) => !role.reservedBy && fitsRole(role)))) return false;
      if (category !== 'all' && notice.category !== category) return false;
      if (company !== 'all' && notice.company !== company) return false;
      if (!needle) return true;
      return [notice.name, notice.code, notice.category, notice.company,
        ...notice.roles.map((role) => `${role.role}${role.code}`)]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [all, query, category, company, takeFilter, fitsRole]);
  const dirty = Boolean(query || category !== 'all' || company !== 'all' || takeFilter !== 'all');
  const reset = () => { setQuery(''); setCategory('all'); setCompany('all'); setTakeFilter('all'); };

  return (
    <>
      <div data-sweet-notice-filter className="mt-2 rounded-ui-md border border-line bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-ui-md border border-line bg-surface-soft px-3 py-1.5 transition-colors focus-within:border-brand-line">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-faint">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              data-sweet-notice-search
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); }}
              placeholder="搜索通告名称、编号、类型、公司或角色"
              aria-label="筛选筹备中通告"
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
          </label>
          <label className="flex shrink-0 items-center gap-1.5 rounded-ui-md border border-line bg-surface-soft px-2.5 py-1.5 text-ui-2xs text-ink-faint">
            公司
            <select
              data-sweet-notice-company
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              className="max-w-[150px] bg-transparent text-ui-2xs text-ink outline-none"
              aria-label="按制作公司筛选"
            >
              <option value="all">全部</option>
              {companies.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          {/* 接取情况两档与主站同款：未预约＝还有角色空着；满足条件＝空角色里
              至少有一位我方艺人性别与所需数值全达标。数字不受其它筛选影响。 */}
          <div data-sweet-notice-take-filter role="group" aria-label="按接取情况筛选" className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-sweet-filter-slots
              aria-pressed={takeFilter === 'slots'}
              onClick={() => setTakeFilter((value) => (value === 'slots' ? 'all' : 'slots'))}
              title="还有角色没被人预约，也还没停止接取 —— 我方数值够不够另说"
              className={sweetChipClass(takeFilter === 'slots')}
            >
              未预约
              <span className={cn('tabular-nums', takeFilter === 'slots' ? 'text-white/80' : 'text-ink-faint')}>
                {slotCount}
              </span>
            </button>
            <button
              type="button"
              data-sweet-filter-qualified
              aria-pressed={takeFilter === 'qualified'}
              onClick={() => setTakeFilter((value) => (value === 'qualified' ? 'all' : 'qualified'))}
              title="还有角色没被预约，并且我方至少有一位艺人的性别与所需数值都达标"
              className={sweetChipClass(takeFilter === 'qualified')}
            >
              满足条件
              <span className={cn('tabular-nums', takeFilter === 'qualified' ? 'text-white/80' : 'text-ink-faint')}>
                {qualifiedCount}
              </span>
            </button>
          </div>
          {dirty && (
            <button
              type="button"
              data-sweet-notice-reset
              onClick={reset}
              className="shrink-0 rounded-ui-md border border-line bg-surface px-2.5 py-1.5 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
            >
              重置筛选
            </button>
          )}
          <span data-sweet-notice-count className="ml-auto whitespace-nowrap text-ui-2xs tabular-nums text-ink-faint">
            当前 {notices.length} / {all.length} 条
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-sweet-notice-cats role="group" aria-label="按类型筛选">
          <button type="button" data-sweet-notice-cat="all" aria-pressed={category === 'all'} onClick={() => setCategory('all')} className={sweetChipClass(category === 'all')}>
            全部 <span className={cn('tabular-nums', category === 'all' ? 'text-white/80' : 'text-ink-faint')}>{all.length}</span>
          </button>
          {categories.map(([name, count]) => (
            <button
              key={name}
              type="button"
              data-sweet-notice-cat={name}
              aria-pressed={category === name}
              onClick={() => setCategory(category === name ? 'all' : name)}
              className={sweetChipClass(category === name)}
            >
              {name} <span className={cn('tabular-nums', category === name ? 'text-white/80' : 'text-ink-faint')}>{count}</span>
            </button>
          ))}
        </div>
      </div>
      {notices.length === 0 ? (
        <div className="mt-2">
          <EmptyState title="没有符合条件的通告" text="改一下筛选条件或清空搜索再试。" />
        </div>
      ) : (
        <div data-sweet-notice-table className="mt-2 rounded-ui-md border border-line bg-surface">
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
              <SweetNoticeRows key={`${notice.code}-${notice.seq}`} notice={notice} save={save} genders={genders} />
            ))}
          </table>
        </div>
      )}
    </>
  );
}

/** 与主站「宣传活动」同款：作品一张卡，宣传子类 → 旗下艺人，每人一行。 */
function SweetPromoPanel({ groups }: {
  groups: { code: string; name: string; category: string; items: SweetPromoNotice[] }[];
}) {
  if (groups.length === 0) {
    return (
      <div className="mt-2">
        <EmptyState
          title="档期内没有宣传活动"
          text="只显示在档期内、且有旗下艺人参与的作品宣传。换一份有发行记录、或当前日期在宣传档期内的存档再试。"
        />
      </div>
    );
  }
  return (
    <div data-case-promo className="mt-2 flex flex-col gap-1.5">
      {groups.map((group) => {
        const castCount = group.items.reduce((sum, item) => sum + item.casts.length, 0);
        return (
          <div key={group.code} className="overflow-hidden rounded-ui-md border border-line bg-surface">
            <div data-case-promo-group={group.code} className="flex items-center gap-2 px-3 py-2 text-left text-ui-xs">
              <span className="font-semibold text-ink">{group.name}</span>
              <span className="text-ui-2xs text-ink-faint">{group.code}</span>
              <span className={cn(
                'inline-block rounded-full px-2 py-0.5 text-ui-2xs font-semibold',
                SWEET_CATEGORY_CLASS[group.category] ?? 'bg-surface-soft text-ink-muted',
              )}
              >
                {group.category}
              </span>
              <span className="ml-auto rounded-full bg-surface-soft px-2 py-0.5 text-ui-2xs tabular-nums text-ink-muted">
                {castCount} 角色
              </span>
            </div>
            <div className="border-t border-line">
              <table className="w-full table-fixed border-collapse text-ui-xs">
                <thead>
                  <tr className="bg-surface-soft text-left text-ui-2xs font-semibold text-ink-muted">
                    <Th className="w-[20%]">宣传子类</Th>
                    <Th className="w-[26%]">档期（开拍 → 杀青）</Th>
                    <Th className="w-[18%]">角色</Th>
                    <Th className="w-[24%]">签约</Th>
                    <Th className="w-[12%]">宣传天数</Th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.flatMap((item) => item.casts.map((cast, ci) => (
                    <tr key={`${item.code}-${item.kind}-${cast.artistId}-${ci}`} className="border-t border-line/60">
                      {ci === 0 ? (
                        <>
                          <Td rowSpan={item.casts.length} className="border-b border-line">
                            <span className="rounded-full bg-tag-talk-soft px-2 py-0.5 text-ui-2xs font-semibold text-tag-talk">
                              {item.kind}
                            </span>
                          </Td>
                          <Td rowSpan={item.casts.length} className="border-b border-line tabular-nums text-ui-2xs text-ink-muted">
                            {item.startDate} → {item.endDate}
                          </Td>
                        </>
                      ) : null}
                      <Td>
                        <span className="rounded-full bg-surface-soft px-2 py-0.5 text-ui-2xs text-ink-muted">
                          {cast.role}
                        </span>
                      </Td>
                      <Td className="text-ink">{cast.artistName}</Td>
                      <Td className="tabular-nums text-ink">{cast.doneDays}</Td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 等待上市 / 热卖中共用：与主站 WaitingPanel 同款卡片，作品一行、旗下参演角色逐行列出。 */
function SweetWaitingPanel({
  notices,
  emptyTitle = '没有等待上市的作品',
  emptyText = '只列旗下艺人已参演、拍摄完成但还没到发行日的作品。换一份带这类记录的存档再试。',
}: {
  notices: SweetWaitingNotice[];
  emptyTitle?: string;
  emptyText?: string;
}) {
  if (notices.length === 0) {
    return (
      <div className="mt-2">
        <EmptyState title={emptyTitle} text={emptyText} />
      </div>
    );
  }
  return (
    <div data-case-waiting className="mt-2 flex flex-col gap-1.5">
      {notices.map((notice) => (
        <div
          key={notice.code}
          data-case-waiting-work={notice.code}
          className="overflow-hidden rounded-ui-md border border-line bg-surface"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-line px-3 py-2 text-ui-xs">
            <span className="font-semibold text-ink">{notice.name}</span>
            <span className="text-ui-2xs text-ink-faint">{notice.code}</span>
            <span className={cn(
              'inline-block rounded-full px-2 py-0.5 text-ui-2xs font-semibold',
              SWEET_CATEGORY_CLASS[notice.category] ?? 'bg-surface-soft text-ink-muted',
            )}
            >
              {notice.category}
            </span>
            {Boolean(notice.type || notice.company) && (
              <span className="text-ui-2xs text-ink-faint">
                {[notice.type, notice.company].filter(Boolean).join(' · ')}
              </span>
            )}
            <span className="ml-auto whitespace-nowrap text-ui-2xs tabular-nums text-ink-muted">
              发行 {notice.saleStart} → {notice.saleEnd}
            </span>
          </div>
          <table className="w-full table-fixed border-collapse text-ui-xs">
            <thead>
              <tr className="bg-surface-soft text-left text-ui-2xs font-semibold text-ink-muted">
                <Th className="w-[22%]">拍摄档期</Th>
                <Th className="w-[20%]">角色</Th>
                <Th className="w-[26%]">旗下参演</Th>
                <Th className="w-[14%]">完成天数</Th>
                <Th className="w-[18%]">酬劳</Th>
              </tr>
            </thead>
            <tbody>
              {notice.casts.map((cast, ci) => (
                <tr key={`${notice.code}-${cast.artistId}-${ci}`} className="border-t border-line/60">
                  {ci === 0 && (
                    <Td rowSpan={notice.casts.length} className="tabular-nums text-ink-muted">
                      {notice.startDate} → {notice.endDate}
                    </Td>
                  )}
                  <Td>
                    <span className="rounded-full bg-surface-soft px-2 py-0.5 text-ui-2xs text-ink-muted">
                      {cast.role?.role ?? '个人'}
                    </span>
                  </Td>
                  <Td className="text-ink">{cast.artistName}</Td>
                  <Td className="tabular-nums text-ink">{cast.doneDays}</Td>
                  <Td className="tabular-nums text-ink">
                    {cast.pay > 0 ? sweetMoney(cast.pay) : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** 已完成：与主站 DoneListPanel 同款紧凑表格，作品一行、多位旗下参演才拆行。
 *  类别单选 + 艺人多选取交集，10 件作品一页，翻页器在列表下方左对齐。 */
function SweetDonePanel({ notices }: { notices: SweetDoneNotice[] }) {
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [artistSel, setArtistSel] = useState<Set<string>>(() => new Set());
  const PAGE = 10;
  const sorted = useMemo(() => [...notices].sort((a, b) => {
    const da = a.startDate || '';
    const db = b.startDate || '';
    if (!da) return db ? 1 : a.name.localeCompare(b.name, 'zh-Hans-CN');
    if (!db) return -1;
    return da.localeCompare(db) || a.name.localeCompare(b.name, 'zh-Hans-CN');
  }), [notices]);
  const byCategory = new Map<string, number>();
  const artistOptions = new Map<string, string>();
  for (const notice of sorted) {
    byCategory.set(notice.category, (byCategory.get(notice.category) ?? 0) + 1);
    for (const cast of notice.casts) {
      if (!artistOptions.has(cast.artistName)) artistOptions.set(cast.artistName, cast.artistName);
    }
  }
  const chip = (on: boolean) => cn(
    'rounded-full px-2 py-0.5 text-ui-2xs transition-colors',
    on ? 'bg-brand font-semibold text-white' : 'bg-surface-soft text-ink-muted hover:text-brand-strong',
  );
  const toggleArtist = (name: string) => {
    setArtistSel((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
    setPage(0);
  };
  const toggleCategory = (value: string) => {
    setFilter(filter === value ? 'all' : value);
    setPage(0);
  };
  const visible = sorted.filter((notice) => {
    if (filter !== 'all' && notice.category !== filter) return false;
    if (artistSel.size === 0) return true;
    return notice.casts.some((cast) => artistSel.has(cast.artistName));
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(clampedPage * PAGE, clampedPage * PAGE + PAGE);
  const goPage = (next: number) => setPage(Math.max(0, Math.min(next, pageCount - 1)));
  if (notices.length === 0) {
    return (
      <div className="mt-2">
        <EmptyState title="没有已完成作品" text="只列旗下艺人已参演、已过发行下架日的作品。换一份带这类记录的存档再试。" />
      </div>
    );
  }
  return (
    <div data-case-done className="mt-2">
      <div className="overflow-hidden rounded-ui-md border border-line bg-surface">
        <div
          data-case-done-summary
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2 text-ui-2xs text-ink-faint"
        >
          <button
            type="button"
            data-case-done-filter="all"
            aria-pressed={filter === 'all'}
            onClick={() => { setFilter('all'); setPage(0); }}
            className={chip(filter === 'all')}
          >
            共 <span className="tabular-nums">{notices.length}</span> 条
          </button>
          {[...byCategory].map(([category, count]) => (
            <button
              key={category}
              type="button"
              data-case-done-filter={category}
              aria-pressed={filter === category}
              onClick={() => toggleCategory(category)}
              className={chip(filter === category)}
            >
              {category} <span className="tabular-nums">{count}</span>
            </button>
          ))}
        </div>
        {artistOptions.size > 0 && (
          <div
            data-case-done-artist-filter
            className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2 text-ui-2xs text-ink-faint"
          >
            <span className="shrink-0 font-semibold text-ink-muted">艺人</span>
            <button
              type="button"
              data-case-done-artist="all"
              aria-pressed={artistSel.size === 0}
              onClick={() => { setArtistSel(new Set()); setPage(0); }}
              className={chip(artistSel.size === 0)}
            >
              全部艺人
            </button>
            {[...artistOptions].map(([name]) => (
              <button
                key={name}
                type="button"
                data-case-done-artist={name}
                aria-pressed={artistSel.has(name)}
                onClick={() => toggleArtist(name)}
                className={chip(artistSel.has(name))}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <table className="w-full table-fixed border-collapse text-ui-xs">
          <thead>
            <tr className="bg-surface-soft text-left text-ui-2xs font-semibold text-ink-muted">
              <Th className="w-[15%]">作品</Th>
              <Th className="w-[7%]">类型</Th>
              <Th className="w-[11%]">公司</Th>
              <Th className="w-[11%]">通告类型</Th>
              <Th className="w-[17%]">拍摄档期</Th>
              <Th className="w-[17%]">发行档期</Th>
              <Th className="w-[8%]">角色</Th>
              <Th className="w-[8%]">旗下参演</Th>
              <Th className="w-[6%]">酬劳</Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((notice) => notice.casts.map((cast, ci) => (
              <tr key={`${notice.code}-${ci}`} className="border-b border-line/60">
                {ci === 0 ? (
                  <>
                    <Td rowSpan={notice.casts.length} className="align-top">
                      <span className="font-semibold text-ink">{notice.name}</span>
                      <span className="ml-1 text-ui-2xs font-normal text-ink-faint">{notice.code}</span>
                    </Td>
                    <Td rowSpan={notice.casts.length} className="align-top">
                      <span className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-ui-2xs font-semibold',
                        SWEET_CATEGORY_CLASS[notice.category] ?? 'bg-surface-soft text-ink-muted',
                      )}
                      >
                        {notice.category}
                      </span>
                    </Td>
                    <Td rowSpan={notice.casts.length} className="align-top text-ui-2xs text-ink-muted">{notice.company || '—'}</Td>
                    <Td rowSpan={notice.casts.length} className="align-top text-ui-2xs text-ink-muted">{notice.type || '—'}</Td>
                    <Td rowSpan={notice.casts.length} className="align-top whitespace-nowrap tabular-nums text-ink-muted">
                      {notice.startDate && notice.endDate ? `${notice.startDate} → ${notice.endDate}` : '—'}
                    </Td>
                    <Td rowSpan={notice.casts.length} className="align-top whitespace-nowrap tabular-nums text-ink-muted">
                      {notice.saleStart} → {notice.saleEnd}
                    </Td>
                  </>
                ) : null}
                <Td className="align-top">
                  <span className="rounded-full bg-surface-soft px-2 py-0.5 text-ui-2xs text-ink-muted">
                    {cast.role?.role ?? '个人'}
                  </span>
                </Td>
                <Td className="align-top text-ink">{cast.artistName}</Td>
                <Td className="align-top tabular-nums text-ink">{cast.pay > 0 ? sweetMoney(cast.pay) : '—'}</Td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div
        data-case-done-pager
        className="mt-2 flex flex-wrap items-center justify-start gap-2 text-ui-2xs text-ink-muted"
      >
        <button
          type="button"
          data-case-done-prev
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
            data-case-done-page={i + 1}
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
          data-case-done-next
          disabled={clampedPage >= pageCount - 1}
          onClick={() => goPage(clampedPage + 1)}
          className="rounded-full border border-line px-2.5 py-1 transition-colors hover:border-brand-line hover:text-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
        </button>
        <span data-case-done-pageinfo className="ml-1 tabular-nums">
          第 {clampedPage + 1} / {pageCount} 页 · 共 {visible.length} 件
        </span>
      </div>
    </div>
  );
}

const SELF_MADE_STATUS_LABEL: Record<SweetSelfMadeStatus, string> = {
  shooting: '拍摄中', pending: '未开拍', done: '已完成', unknown: '无档期',
};
const SELF_MADE_STATUS_ORDER: SweetSelfMadeStatus[] = ['shooting', 'pending', 'done', 'unknown'];

/** 自制作品及其他：照主站 SelfMadePanel 的八列表格，一位旗下艺人一行，
 *  通告 / 档期 / 状态 / 出品用 rowSpan 合起来；对手演员占角色格但不占行。 */
function SweetSelfMadePanel({
  notices, emptyTitle, emptyText,
}: { notices: SweetSelfMadeNotice[]; emptyTitle: string; emptyText: string }) {
  const [filter, setFilter] = useState('all');
  const byCategory = new Map<string, number>();
  const byStatus = new Map<SweetSelfMadeStatus, number>();
  let taken = 0;
  const rowsOf = (notice: SweetSelfMadeNotice) => notice.casts.filter((cast) => cast.mine);
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
    on ? 'bg-brand font-semibold text-white' : 'bg-surface-soft text-ink-muted hover:text-brand-strong',
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
            const rows = mine.length > 0 ? mine : [null];
            return rows.map((cast, index) => (
              <tr
                key={`${notice.code}-${cast?.artistId ?? 'none'}`}
                data-case-selfmade-row={notice.code}
                data-case-selfmade-status={notice.status}
                data-case-selfmade-cast={mine.length}
                className={cn('align-top', index === 0 ? 'border-t border-line' : '')}
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
                        SWEET_CATEGORY_CLASS[notice.category] ?? 'bg-surface-soft text-ink-muted',
                      )}
                      >
                        {notice.category}
                      </span>
                      {notice.type && notice.type !== notice.category && (
                        <span className="text-ui-2xs text-ink-faint">{notice.type}</span>
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
                              ? notice.daysToStart > 0 ? `还有 ${notice.daysToStart} 天开拍` : '还没人接'
                              : `共 ${notice.endDay - notice.startDay + 1} 天`}
                        </div>
                      </>
                    ) : <span className="text-ink-faint">—</span>}
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
                  {cast?.role ? <SweetRolePill role={cast.role} /> : <span className="text-ui-2xs text-ink-faint">—</span>}
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
                  ) : <span className="text-ui-2xs text-ink-faint">还没有艺人接</span>}
                </Td>
                <Td className="tabular-nums text-ui-2xs text-ink-muted">
                  {cast ? sweetMoney(cast.pay) : '—'}
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
                  ) : <span className="text-ui-2xs text-ink-faint">—</span>}
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

const SHOOTING_STATUS_LABEL: Record<string, string> = {
  shooting: '拍摄中', pending: '待开拍', done: '已完成',
};
const SHOOTING_RISK_LABEL: Record<string, string> = {
  ok: '—', tight: '逾期风险', late: '违约提醒', unknown: '—',
};

/** 拍摄中：与主站 ShootingPanel 同款 8 列表格。白底＝我方真进度（rowSpan
 *  通告信息），灰底＝同片其他艺人 / 空缺角色格，进度酬劳显示「—」。 */
function SweetShootingPanel({ notices }: { notices: SweetShootingNotice[] }) {
  if (notices.length === 0) {
    return (
      <div className="mt-2">
        <EmptyState title="没有拍摄中的通告" text="游戏里没有已接取且还没杀青的通告。" />
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
          {notices.flatMap((notice) => {
            type Row =
              | { kind: 'mine'; cast: SweetShootingCast }
              | { kind: 'other'; other: SweetShootingOtherCast };
            const rows: Row[] = [
              ...notice.casts.map((cast): Row => ({ kind: 'mine', cast })),
              ...notice.otherCasts.map((other): Row => ({ kind: 'other', other })),
            ];
            return rows.map((row, index) => {
              const mine = row.kind === 'mine' ? row.cast : null;
              const other = row.kind === 'other' ? row.other : null;
              const role = mine ? mine.role : other?.role ?? null;
              const isFirst = index === 0;
              return (
                <tr
                  key={`${notice.code}-${mine ? `mine-${mine.artistId}` : `other-${other?.artistId ?? `vacant-${other?.role?.code}`}`}`}
                  data-case-shooting-row={notice.code}
                  data-case-shooting-risk={mine?.risk ?? ''}
                  className={cn(
                    'align-top', isFirst ? 'border-t border-line' : '',
                    other ? 'bg-surface-soft/60 text-ink-muted' : '',
                    mine?.risk === 'late'
                      ? 'border-l-[3px] border-l-alert bg-alert-soft/50'
                      : mine?.risk === 'tight'
                        ? 'border-l-[3px] border-l-gold-line bg-gold-soft/40'
                        : 'border-l-[3px] border-l-transparent',
                  )}
                >
                  {isFirst && (
                    <Td rowSpan={rows.length} className="border-b border-line">
                      <span className="text-ui-xs font-semibold text-ink">{notice.name}</span>
                      <div className="mt-0.5 tabular-nums text-ui-2xs text-ink-faint">{notice.code}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className={cn(
                          'inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-ui-2xs',
                          SWEET_CATEGORY_CLASS[notice.category] ?? 'bg-surface-soft text-ink-muted',
                        )}
                        >
                          {notice.category}
                        </span>
                        {notice.type && (
                          <span className="text-ui-2xs text-ink-faint">{notice.type}</span>
                        )}
                      </div>
                    </Td>
                  )}
                  {isFirst && (
                    <Td rowSpan={rows.length} className="tabular-nums border-b border-line text-ui-2xs">
                      <div className="whitespace-nowrap text-ink-muted">
                        开拍 <b className="font-semibold text-ink">{notice.startDate || '—'}</b>
                      </div>
                      <div className="whitespace-nowrap text-ink-muted">
                        杀青 <b className="font-semibold text-ink">{notice.endDate || '—'}</b>
                      </div>
                      <div className="mt-0.5 text-ink-faint">共 {notice.endDay - notice.startDay + 1} 天</div>
                    </Td>
                  )}
                  <Td>
                    {role ? <SweetRolePill role={role} /> : <span className="text-ui-2xs text-ink-faint">—</span>}
                  </Td>
                  <Td>
                    {mine ? (
                      <>
                        <span
                          data-case-shooting-artist={mine.artistId}
                          className="whitespace-nowrap text-ui-xs font-semibold text-ink"
                        >
                          {mine.artistName}
                        </span>
                        <div
                          data-case-shooting-status={mine.status}
                          className={cn(
                            'mt-0.5 inline-flex rounded-full px-1.5 text-ui-2xs',
                            mine.status === 'shooting'
                              ? 'bg-brand-soft font-semibold text-brand-strong'
                              : 'bg-surface-soft text-ink-faint',
                          )}
                        >
                          {SHOOTING_STATUS_LABEL[mine.status]}
                        </div>
                      </>
                    ) : other?.vacant ? (
                      <span data-case-shooting-vacant={other.role?.code} className="italic text-ui-xs text-ink-faint">
                        虚位以待
                      </span>
                    ) : (
                      <span data-case-shooting-other={other?.artistId ?? ''} className="whitespace-nowrap text-ui-xs text-ink-muted">
                        {other?.artistName}
                      </span>
                    )}
                  </Td>
                  <Td className="tabular-nums text-ui-2xs">
                    {mine ? (
                      <>
                        <span className="text-ui-xs font-bold text-ink">{mine.doneDays}</span>
                        <span className="text-ink-faint"> / {mine.workDays || '—'} 天</span>
                        <div className="mt-0.5 text-ink-faint">每週 ≤ {mine.daysPerWeek || '—'} 天</div>
                      </>
                    ) : <span className="text-ink-faint">—</span>}
                  </Td>
                  <Td className="tabular-nums text-ui-2xs">
                    {mine ? (
                      mine.status === 'done' ? (
                        <span className="text-ui-2xs text-ink-faint">已拍完</span>
                      ) : (
                        <>
                          <span className="text-ui-xs font-semibold text-ink">{mine.needDays}</span>
                          <span className="text-ink-faint"> 天</span>
                          <div className="mt-0.5 leading-tight text-ink-faint">
                            <div className="whitespace-nowrap">能排 {mine.canShootDays} 天</div>
                            <div className="whitespace-nowrap">距杀青 {Number.isFinite(notice.daysLeft) ? notice.daysLeft : '—'} 天</div>
                          </div>
                        </>
                      )
                    ) : <span className="text-ink-faint">—</span>}
                  </Td>
                  <Td className="tabular-nums text-ui-2xs text-ink-muted">
                    {mine ? sweetMoney(mine.pay) : <span className="text-ink-faint">—</span>}
                  </Td>
                  <Td>
                    {mine && (mine.risk === 'tight' || mine.risk === 'late') ? (
                      <>
                        <span
                          data-case-shooting-risk-label={mine.risk}
                          className={cn(
                            'inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-ui-2xs',
                            mine.risk === 'late'
                              ? 'border-alert-line bg-alert-soft font-bold text-alert'
                              : 'border-gold-line bg-gold-soft font-semibold text-gold',
                          )}
                        >
                          {SHOOTING_RISK_LABEL[mine.risk]}
                        </span>
                        {mine.risk === 'tight' && (
                          <div className="mt-0.5 text-ui-2xs text-ink-faint">余量 ≤ 5 天</div>
                        )}
                      </>
                    ) : <span className="text-ui-2xs text-ink-faint">—</span>}
                  </Td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 道具分类页签的固定顺序：一般 / 特殊 / 公司。 */
const ITEM_CAT_ORDER = ['一般物品', '特殊物品', '公司物品'] as const;
type ItemCat = typeof ITEM_CAT_ORDER[number];

/** 分类胶囊沿用明星志愿3：公司物品绿、特殊物品粉、一般物品中性描边。 */
/** 制作人好感：前五列与明星志愿3一致，另加甜蜜乐章的舞台剧 / 时装秀一列；
 *  编号 / 名字来自甜站 MapRole + StudioProduce 烘焙，友好度按编号从存档友好度表反查。 */
const SWEET_PRODUCER_GROUPS = [
  { key: 'record', label: '唱片' },
  { key: 'tv', label: '电视剧' },
  { key: 'movie', label: '电影' },
  { key: 'ad', label: '广告' },
  { key: 'host', label: '主持' },
  { key: 'stage', label: '舞台剧 / 时装秀' },
  { key: 'other', label: '其他' },
];

function SweetProducerPanel({
  producers, friendship,
}: {
  producers: Array<{ code: number; name: string; group: string }>;
  friendship: Record<number, number>;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
      {SWEET_PRODUCER_GROUPS.map((group) => {
        const members = producers.filter((p) => p.group === group.key);
        return (
          <div
            key={group.key}
            data-sweet-case-producer-group={group.key}
            className="rounded-ui-sm border border-line bg-surface px-2 py-1.5"
          >
            <div className="mb-1 border-b border-line pb-1 text-ui-2xs font-bold text-brand-strong">
              {group.label}
              <span className="ml-1 font-normal text-ink-faint">{members.length}</span>
            </div>
            <div className="flex flex-col gap-1">
              {members.length === 0 ? (
                <div className="py-1 text-ui-2xs text-ink-faint">待补充</div>
              ) : members.map((producer) => {
                const value = friendship[producer.code];
                return (
                  <div
                    key={producer.code}
                    data-sweet-case-producer={producer.code}
                    data-sweet-case-producer-friendship={value ?? ''}
                    className="flex items-baseline justify-between gap-1 border-b border-line/60 pb-1 text-ui-2xs last:border-0 last:pb-0"
                  >
                    <span className="font-semibold text-ink">{producer.name}</span>
                    <span className={cn('tabular-nums', value === undefined ? 'text-ink-faint' : 'font-semibold text-brand-strong')}>
                      {value === undefined ? '—' : value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function itemCategoryClass(category: string): string {
  if (category === '公司物品') return 'bg-accept-soft text-accept';
  if (category === '特殊物品') return 'border border-brand-line bg-brand-soft text-brand-strong';
  return 'border border-line text-ink-faint';
}

/** 道具面板：三个分类页签，每页 10 件，末页补占位行保持表格高度不跳。
 *  数量 / 编号来自存档 Item 段，名称 / 分类 / 说明 / 属性来自烘焙的 Item.dat 表。 */
function SweetItemsPanel({
  items, tableCount, signed, gifts, giftSlots,
}: {
  items: SweetOwnedItem[];
  tableCount: number;
  signed: { id: number; name: string }[];
  gifts: Record<string, number[]>;
  giftSlots: Record<string, number>;
}) {
  const owned = useMemo(() => items.filter((it) => it.quantity > 0), [items]);
  /** 送礼好感：只列这份存档里的签约艺人，且 Item.dat 对应槽位加成 > 0。 */
  const giftHints = useMemo(() => {
    const out: Record<number, { name: string; value: number }[]> = {};
    for (const it of owned) {
      const vector = gifts[String(it.code)];
      if (!vector) continue;
      const hints: { name: string; value: number }[] = [];
      for (const option of signed) {
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
    const g: Record<string, SweetOwnedItem[]> = {};
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
                  <th className="w-68 py-1 pr-2 font-medium" title="送给当前存档已签约艺人的好感加成">好感度</th>
                )}
                <th className="py-1 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: PAGE }, (_, i) => {
                const it = pageRows[i];
                if (!it) {
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

/** 甜蜜乐章存档解析：游戏时间 / 公司 / 艺人卡片与合约信息。 */
export default function SweetCaseView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [save, setSave] = useState<SweetSave | null>(null);
  const [stars, setStars] = useState<Record<string, string>>({});
  const [genders, setGenders] = useState<Record<string, number>>({});
  const [tables, setTables] = useState<SweetCaseTables>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [titleMeta, setTitleMeta] = useState<Record<string, TitleMeta>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<'promo' | 'open' | 'shooting' | 'waiting' | 'hot' | 'done' | 'selfMade'>('open');
  const updateInfo = useMemo(
    () => (save ? sweetUpdateInfo(save) : { closingCount: 0, batches: [], nextUpdate: null }),
    [save],
  );

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/sweet/star-roles.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('艺人表加载失败'))))
      .then((data: { stars?: Record<string, string>; genders?: Record<string, number> }) => {
        setStars(data.stars ?? {});
        setGenders(data.genders ?? {});
      })
      .catch(() => setError('艺人表加载失败，艺人姓名可能显示为编号。'));
    fetch(`${import.meta.env.BASE_URL}data/sweet/case-tables.json?v=${Date.now()}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('通告表加载失败'))))
      .then((data: SweetCaseTables) => setTables(data))
      .catch(() => { /* 不挡住存档解析，通告会退回只用存档自身信息 */ });
    // 编号体系沿用主站，但门槛来自甜蜜乐章自己的 Nickname.dat（多了舞台剧 / 走秀 / 演唱会）。
    fetch(`${import.meta.env.BASE_URL}data/sweet/title-meta.json?v=${Date.now()}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('称号表加载失败'))))
      .then((data: {
        titles?: Record<string, string>;
        titleMeta?: Record<string, TitleMeta>;
      }) => {
        setTitles(data.titles ?? {});
        setTitleMeta(data.titleMeta ?? {});
      })
      .catch(() => { /* 不挡住存档解析 */ });
  }, []);

  const receive = async (file?: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setError('');
    setSave(null);
    setBusy(true);
    try {
      setSave(await parseSweetSave(file, stars, titles, tables));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '存档读取失败');
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setFileName('');
    setSave(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const promoGroups = useMemo(() => {
    if (!save) return [] as { code: string; name: string; category: string; items: SweetPromoNotice[] }[];
    const mineIds = new Set(save.artists.map((artist) => artist.id));
    const teamIds = new Set(save.teams.flatMap((team) => team.memberIds));
    const todayNum = Math.floor(Date.UTC(save.date.year, save.date.month - 1, save.date.day) / 86400000);
    const map = new Map<string, SweetPromoNotice[]>();
    for (const notice of save.promo) {
      const casts = notice.casts.filter((cast) => mineIds.has(cast.artistId) || teamIds.has(cast.artistId));
      if (casts.length === 0) continue;
      const list = map.get(notice.code) ?? [];
      list.push({ ...notice, casts });
      map.set(notice.code, list);
    }
    const order = ['电视剧宣传', '电影宣传', '首映会', '唱片宣传', '拍摄MTV', '签名会', '舞台剧演出', '国际时装周'];
    const rank = (kind: string) => { const i = order.indexOf(kind); return i < 0 ? 99 : i; };
    return [...map].map(([code, items]) => ({ code, items }))
      .filter(({ items }) => {
        // 与主站同口径：作品档期取主打宣传里最晚的杀青日，过了就不算宣传中。
        const deadlines = items.filter((item) => item.mainKind).map((item) => item.endDay);
        return deadlines.length === 0 || todayNum <= Math.max(...deadlines);
      })
      .map(({ code, items }) => ({
        code,
        name: items[0]?.name || code,
        category: items[0]?.category || '',
        items: [...items].sort((a, b) => rank(a.kind) - rank(b.kind)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }, [save]);

  return (
    <div
      data-sweet-case-reader
      data-sweet-case-dropzone
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void receive(event.dataTransfer.files?.[0] ?? null);
      }}
      className={cn(
        'fixed inset-x-0 bottom-0 top-16 z-50 overflow-hidden bg-canvas',
        dragging && 'ring-2 ring-inset ring-brand',
      )}
    >
      {/* 与主站存档解析一致：内容列自己滚、右侧给本页小结留出固定宽度。 */}
      <div
        data-sweet-case-scroll
        className="absolute inset-0 overflow-y-auto px-8 pt-3 pb-10 nav:px-5 min-[1120px]:pr-[288px]"
      >
        <div className="mx-auto w-full max-w-[1600px]">
          <div
            data-sweet-case-toolbar
            className="flex flex-wrap items-center gap-2 rounded-ui-md border border-line bg-surface px-3 py-2"
          >
            <button
              type="button"
              data-sweet-case-upload-button
              onClick={() => inputRef.current?.click()}
              className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-ui-2xs font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              {fileName ? '换一个存档' : '选择存档'}
            </button>
            <input
              ref={inputRef}
              data-sweet-case-upload
              type="file"
              accept=".sav,.SAV"
              className="hidden"
              onChange={(event) => {
                void receive(event.target.files?.[0] ?? null);
                event.currentTarget.value = '';
              }}
              aria-label="选择甜蜜乐章存档文件"
            />
            {!fileName && (
              <span className="text-ui-2xs text-ink-faint">
                把甜蜜乐章游戏存档拖到这里，或点上面的按钮选择。
              </span>
            )}
            {fileName && (
              <>
                <span data-sweet-case-file className="max-w-[180px] truncate text-ui-2xs text-ink-faint" title={fileName}>
                  {fileName}
                </span>
                <button
                  type="button"
                  data-sweet-case-clear
                  onClick={clear}
                  className="shrink-0 rounded-full border border-line px-2.5 py-1.5 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
                >
                  清空
                </button>
              </>
            )}
          </div>

          {busy && <p className="mt-2 text-ui-2xs text-ink-muted">正在解析存档…</p>}
          {error && (
            <div data-sweet-case-error className="mt-2 rounded-ui-md border border-alert-line bg-alert-soft px-4 py-2.5">
              <span className="text-ui-xs font-semibold text-alert">没能读出这份存档：</span>
              <span className="text-ui-2xs text-ink-muted">{error}</span>
            </div>
          )}

          {save && !busy && (
            <>
              {/* Game clock：与主站同一条窄条 + 品牌胶囊。 */}
              <div data-sweet-case-clock className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ui-md border border-line bg-surface px-3 py-2 text-ui-2xs">
                <span className="font-semibold text-ink-muted">游戏时间</span>
                <span data-sweet-case-date className="rounded-full bg-brand px-2 py-0.5 font-bold text-white">
                  {formatSweetDate(save.date)}
                </span>
                <span className="text-ink-faint">|</span>
                <span className={cn('font-semibold', updateInfo.closingCount ? 'text-alert' : 'text-ink-muted')} data-sweet-case-closing>
                  7 天内停止接取 {updateInfo.closingCount} 条
                </span>
                <span className="text-ink-faint">|</span>
                {updateInfo.nextUpdate ? (
                  <span className="text-ink-muted" data-sweet-case-next-update>
                    下次更新 <b className="text-brand-strong">{updateInfo.nextUpdate.date} 星期{updateInfo.nextUpdate.label}</b>
                    （{updateInfo.nextUpdate.daysAway > 0 ? `${updateInfo.nextUpdate.daysAway} 天后` : '今天'}）：
                    {updateInfo.nextUpdate.companies.join(' / ') || '制作公司未记录'}
                    <span className="ml-1 text-ink-faint">· {updateInfo.nextUpdate.codes.length} 条{updateInfo.nextUpdate.kinds.join('、')}</span>
                  </span>
                ) : (
                  <span className="text-ink-faint">存档里没有更晚一批的通告</span>
                )}
              </div>

              <details data-sweet-case-company data-sweet-case-toc-target open className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5">
                <summary data-sweet-case-company-summary className="cursor-pointer text-ui-xs font-bold text-brand-strong">
                  公司 · {save.company || '名称未记录'}
                  <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                    主角 {save.protagonist || '未记录'}
                  </span>
                </summary>
                <div data-sweet-case-company-stats className="mt-2 grid grid-cols-4 gap-2 phone:grid-cols-2">
                  <SweetCaseStat label="公司形象" value={save.companyImage || '未读出'} attr="image" />
                  <SweetCaseStat label="知名度" value={String(save.fame)} attr="fame" />
                  <SweetCaseStat label="公关" value={String(save.pr)} attr="pr" />
                  <SweetCaseStat
                    label="资金"
                    value={sweetMoney(save.money)}
                    hint={Number.isFinite(save.money) ? `¥${save.money.toLocaleString('en-US')}` : undefined}
                    attr="money"
                    alert={save.money < 0}
                  />
                </div>
                <div data-sweet-case-company-awards className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 text-ui-2xs">
                  <span className="text-ink-faint">奖项</span>
                  {save.awards.filter((award) => awardBelongsToCompany(award, save.company)).length === 0 ? (
                    <span className="text-ink-faint">—</span>
                  ) : save.awards.filter((award) => awardBelongsToCompany(award, save.company)).map((award) => (
                    <span key={`${award.year}-${award.label}`} data-sweet-case-company-award>
                      <span className="award-item font-semibold text-title-star">{award.ceremony}·{award.label}</span>
                      <span className="award-meta ml-1 font-normal text-ink-faint">{award.work}</span>
                      <span className="ml-1 font-normal text-ink-faint">{award.year}</span>
                    </span>
                  ))}
                </div>
              </details>

              <details data-sweet-case-artists data-sweet-case-toc-target open className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5">
                <summary data-sweet-case-artists-summary className="cursor-pointer text-ui-xs font-bold text-brand-strong">
                  我方艺人 · {save.artists.length} 位
                  <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                    {save.artists.map((item) => item.name).join(' / ')}
                  </span>
                </summary>
                <div data-sweet-case-artist-grid className="mt-2 flex flex-wrap gap-2">
                  {save.artists.length === 0 ? (
                    <p className="text-ui-2xs text-ink-faint">这份存档里没有识别到旗下艺人。</p>
                  ) : save.artists.map((artist) => (
                    <div key={artist.id} className="w-[344px] shrink-0">
                      <article data-sweet-case-artist={artist.id} className="rounded border border-line bg-surface px-2 py-1.5">
                        <div className="flex items-baseline gap-1.5">
                          <span
                            data-sweet-case-artist-name
                            title={artist.isProtagonist ? '杜云芊（固定主角）' : undefined}
                            className="text-ui-xs font-bold text-brand-strong"
                          >
                            #{artist.id} {artist.name}
                          </span>
                          {artist.isProtagonist && (
                            <span data-sweet-case-protagonist className="rounded-full bg-brand-soft px-1.5 text-ui-2xs font-semibold text-brand-strong">
                              主角
                            </span>
                          )}
                          {(artist.title || artist.titleId > 0) && (() => {
                            const meta = titleMeta[String(artist.titleId)] ?? null;
                            return (
                              <TitleBadge
                                title={artist.title || `称号${artist.titleId}`}
                                meta={meta}
                                next={nextTitle(
                                  titleMeta, titles, artist.titleId,
                                  sweetTitleStats(save, artist), sweetTitleGender(meta),
                                )}
                              />
                            );
                          })()}
                          {artist.condition && (
                            <span
                              data-sweet-case-artist-condition
                              className={cn(
                                'ml-auto rounded-full px-1.5 text-ui-2xs',
                                artist.condition === '生病'
                                  ? 'bg-alert-soft font-semibold text-alert'
                                  : 'bg-surface-soft text-ink-faint',
                              )}
                            >
                              {artist.condition}
                            </span>
                          )}
                        </div>
                        <div data-sweet-case-attrs className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5 text-ui-2xs text-ink-muted">
                          {SWEET_ABILITY_LABELS.map((label, index) => (
                            <span key={label} className="flex justify-between gap-1 whitespace-nowrap">
                              <span className="text-ink-faint">{label}</span>
                              <b data-sweet-case-ability={label} className="text-ink-muted">
                                {artist.abilities[index] ?? 0}
                              </b>
                            </span>
                          ))}
                        </div>
                        {/* 与主站同一套分层：友好度 > 人气 > 压力/疲劳 > 其余社交项。 */}
                        <div data-sweet-case-social className="mt-1 flex flex-wrap items-center gap-x-1.5 border-y border-line py-1 text-ui-2xs leading-[1.7]">
                          <span data-sweet-case-friendship className="friendship-value font-semibold text-brand-strong">
                            友好度 {artist.friendship}
                          </span>
                          <span data-sweet-case-popularity className="social-item font-semibold text-ink">
                            人气 {artist.social[3]}
                          </span>
                          <span data-sweet-case-stress className="social-item font-medium text-ink-muted">
                            压力 {artist.stress} · 疲劳 {artist.fatigue}
                          </span>
                          <span data-sweet-case-other-social className="text-ink-faint">
                            叛逆 {artist.social[0]} · 性感 {artist.social[1]} · 亲和 {artist.social[2]} · 曝光 {artist.social[4]} · 礼物 {artist.gifts}
                          </span>
                        </div>
                        <div data-sweet-case-counts className="mt-0.5 flex flex-wrap items-center text-ui-2xs">
                          <span className="mr-1 text-ink-faint">通告统计</span>
                          {SWEET_NOTICE_LABELS.map((label, index) => (
                            <SweetWorkCountChip
                              key={label}
                              dataName="data-sweet-case-notice-count"
                              dataValue={label}
                              dataNoticeIndex={index}
                              label={label}
                              value={artist.noticeCounts[index] ?? 0}
                              works={save.works.filter((work) => work.artistId === artist.id && work.noticeIndex === index)}
                              title={`${label}作品`}
                            />
                          ))}
                          <SweetWorkCountChip
                            dataName="data-sweet-case-notice-total"
                            label="合计"
                            value={artist.noticeCounts.reduce((sum, n) => sum + n, 0)}
                            works={save.works.filter((work) => work.artistId === artist.id)}
                            title="全部作品"
                          />
                        </div>
                        {save.awards.some((award) => awardBelongsTo(award, artist.name)) && (
                          <div data-sweet-case-artist-awards className="mt-1 flex flex-wrap items-center gap-1 border-t border-line pt-1 text-ui-2xs">
                            <span className="text-ink-faint">奖项</span>
                            {save.awards.filter((award) => awardBelongsTo(award, artist.name)).map((award) => (
                              <span key={`${award.year}-${award.label}`} data-sweet-case-artist-award>
                                <span className="award-item font-semibold text-title-star">{award.ceremony}·{award.label}</span>
                                <span className="award-meta ml-1 font-normal text-ink-faint">{award.work}</span>
                                <span className="ml-1 font-normal text-ink-faint">{award.year}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {save.events.some((event) => eventBelongsToArtist(event, artist.id)) && (
                          <div data-sweet-case-artist-events className="mt-1 flex flex-wrap items-center gap-1 border-t border-line pt-1 text-ui-2xs">
                            <span className="text-ink-faint">活动</span>
                            {save.events.filter((event) => eventBelongsToArtist(event, artist.id)).map((event) => (
                              <span
                                key={`${event.date}-${event.label}`}
                                data-sweet-case-artist-event
                                data-sweet-case-event-kind={event.kind}
                                data-sweet-case-event-scale={event.scale}
                              >
                                <span className="event-item font-semibold text-event">{event.label}</span>
                                <span className="event-meta ml-1 font-normal text-ink-faint">{event.date}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {artist.contract && (
                          <details data-sweet-case-contract className="mt-1 border-t border-line pt-1 text-ui-2xs">
                            <summary className="cursor-pointer text-ink-faint">
                              合约信息
                              <span className="ml-1 text-ink-faint">
                                {artist.contract.signDate} - {artist.contract.expireDate}
                              </span>
                            </summary>
                            <div data-sweet-case-contract-detail className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-1 text-ink-muted">
                              <span>签约时间 <b data-sweet-case-contract-sign className="font-semibold text-ink">{artist.contract.signDate}</b></span>
                              <span>合约期限 <b data-sweet-case-contract-expire className="font-semibold text-ink">{artist.contract.expireDate}</b></span>
                              <span>签约金 <b data-sweet-case-contract-bonus className="font-semibold text-ink">{sweetMoney(artist.contract.signingBonus)}元</b></span>
                              <span>艺人分红 <b data-sweet-case-contract-dividend className="font-semibold text-ink">{artist.contract.dividend}%</b></span>
                            </div>
                          </details>
                        )}
                      </article>
                    </div>
                  ))}
                </div>
              </details>

              {/* 和明星志愿3「我方团体」同一套卡片：标题 + 编码徽标、队长高亮、
                  通告统计 / 团体奖 / 活动分行，团体奖不进任何艺人卡。 */}
              <details data-sweet-case-teams data-sweet-case-toc-target open className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5">
                <summary data-sweet-case-teams-summary className="cursor-pointer text-ui-xs font-bold text-brand-strong">
                  我方团体 · {save.teams.length} 个
                  <span className="ml-2 font-normal text-ui-2xs text-ink-faint">名称与成员从存档读取</span>
                </summary>
                {save.teams.length === 0 ? (
                  <p data-sweet-case-team-empty className="mt-2 text-ui-2xs text-ink-faint">—</p>
                ) : (
                  <div data-sweet-case-team-grid className="mt-2 flex flex-wrap gap-2">
                    {save.teams.map((team) => (
                      <div
                        key={team.code}
                        data-sweet-case-team={team.code}
                        data-sweet-case-team-code={team.code}
                        className="w-[340px] shrink-0 rounded-ui-md border border-line bg-surface px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span data-sweet-case-team-name className="text-ui-xs font-semibold text-ink">{team.name}</span>
                          <span className="rounded-full bg-brand px-2 py-0.5 text-ui-2xs font-semibold text-white">
                            团体编码 {team.code}
                          </span>
                        </div>
                        <div data-sweet-case-team-members className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-ui-2xs text-ink-faint">成员</span>
                          {team.memberIds.map((id, index) => (
                            <span
                              key={id}
                              data-sweet-case-team-member
                              data-sweet-case-team-leader={index === 0 ? team.memberNames[index] : undefined}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-ui-2xs',
                                index === 0
                                  ? 'border-brand bg-brand-soft font-semibold text-brand-strong'
                                  : 'border-line bg-surface-soft text-ink-muted',
                              )}
                            >
                              {team.memberNames[index] ?? `艺人${id}`}
                              {index === 0 && <span className="text-[10px]">队长</span>}
                            </span>
                          ))}
                        </div>
                        <div data-sweet-case-team-counts className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 text-ui-2xs">
                          <span className="text-ink-faint">通告统计</span>
                          <span className="work-count-chip relative inline-flex">
                            <span data-sweet-case-team-work-count className="rounded px-1 py-0.5 text-ink-faint">
                              唱片 <b className="font-semibold text-ink">{team.workCount}</b>张
                            </span>
                          </span>
                        </div>
                        {save.awards.some((award) => awardBelongsToGroup(award, team)) && (
                          <div data-sweet-case-team-awards className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 text-ui-2xs">
                            <span className="text-ink-faint">团体奖</span>
                            {save.awards.filter((award) => awardBelongsToGroup(award, team)).map((award) => (
                              <span key={`${award.year}-${award.label}`} data-sweet-case-team-award>
                                <span className="award-item font-semibold text-title-star">{award.ceremony}·{award.label}</span>
                                <span className="award-meta ml-1 font-normal text-ink-faint">{award.work}</span>
                                <span className="ml-1 font-normal text-ink-faint">{award.year}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {save.events.some((event) => eventBelongsToGroup(event, team)) && (
                          <div data-sweet-case-team-events className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line pt-1.5 text-ui-2xs">
                            <span className="text-ink-faint">活动</span>
                            {save.events.filter((event) => eventBelongsToGroup(event, team)).map((event) => (
                              <span
                                key={`${event.date}-${event.label}`}
                                data-sweet-case-team-event
                                data-sweet-case-event-kind={event.kind}
                                data-sweet-case-event-scale={event.scale}
                              >
                                <span className="event-item font-semibold text-event">{event.label}</span>
                                <span className="event-meta ml-1 font-normal text-ink-faint">{event.date}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </details>

              {/* 道具：与主站同款三页签 + 每页 10 件；数量 0 不展示。 */}
              {save.items.length > 0 && (
                <details
                  data-sweet-case-items
                  data-sweet-case-toc-target
                  className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5"
                >
                  <summary
                    data-sweet-case-items-summary
                    className="cursor-pointer text-ui-xs font-bold text-brand-strong"
                  >
                    道具
                    <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                      {save.items.filter((it) => it.quantity > 0).length} 件
                    </span>
                  </summary>
                  <SweetItemsPanel
                    items={save.items}
                    tableCount={Object.keys(tables.items ?? {}).length}
                    signed={save.artists.map((artist) => ({ id: artist.id, name: artist.name }))}
                    gifts={tables.gifts ?? {}}
                    giftSlots={tables.giftSlots ?? {}}
                  />
                </details>
              )}

              {/* 场景：与主站同款 2/4 列卡片；解锁标志来自存档 World 记录，费用来自 World.dat。 */}
              {save.scenes.length > 0 && (
                <details
                  data-sweet-case-scenes
                  data-sweet-case-toc-target
                  className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5"
                >
                  <summary
                    data-sweet-case-scenes-summary
                    className="cursor-pointer text-ui-xs font-bold text-brand-strong"
                  >
                    场景
                    <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                      {save.scenes.filter((scene) => scene.unlocked).length}/{save.scenes.length} 已解锁
                    </span>
                  </summary>
                  <div data-sweet-case-scene-grid className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {save.scenes.map((scene) => (
                      <div
                        key={scene.name}
                        data-sweet-case-scene
                        data-sweet-case-scene-unlocked={scene.unlocked}
                        data-sweet-case-scene-cost={scene.cost}
                        className={cn(
                          'flex items-baseline justify-between rounded border px-2 py-1 text-ui-2xs',
                          scene.unlocked
                            ? 'border-growth-line bg-growth-soft text-growth-strong'
                            : 'border-line bg-surface text-ink-faint',
                        )}
                      >
                        <b className="font-semibold">{scene.name}</b>
                        <span className="ml-1 tabular-nums">
                          {scene.unlocked ? '已解锁' : scene.cost.toLocaleString('zh-CN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* 制作人好感：七列分组，友好度按编号从存档友好度表反查。 */}
              {save.producers.length > 0 && (
                <details
                  data-sweet-case-producers
                  data-sweet-case-toc-target
                  className="mt-2 rounded-ui-md border-2 border-brand-line bg-surface-soft px-3 py-2.5"
                >
                  <summary
                    data-sweet-case-producers-summary
                    className="cursor-pointer text-ui-xs font-bold text-brand-strong"
                  >
                    制作人好感
                    <span className="ml-2 font-normal text-ui-2xs text-ink-faint">
                      {save.producers.filter((p) => save.producerFriendship[p.code] !== undefined).length}/{save.producers.length} 位
                    </span>
                  </summary>
                  <SweetProducerPanel
                    producers={save.producers}
                    friendship={save.producerFriendship}
                  />
                </details>
              )}

              {/* 各公司开放节奏：只按页面列出的筹备中通告归并，历史批次不进这里。 */}
              <details data-sweet-case-updates data-sweet-case-toc-target className="mt-2 rounded-ui-md border border-line bg-surface px-3 py-2 text-ui-2xs">
                <summary className="cursor-pointer font-semibold text-brand-strong">
                  各公司开放节奏 · 按下面通告的接取日归并 {updateInfo.batches.length} 批
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {updateInfo.batches.map((batch) => (
                    <span
                      key={batch.date}
                      data-sweet-case-batch
                      className={cn(
                        'rounded border px-2 py-1 leading-[1.5]',
                        batch.daysAway > 0
                          ? 'border-brand-line bg-brand-soft text-ink-muted'
                          : 'border-line bg-surface-soft text-ink-faint',
                      )}
                    >
                      <b className="text-ink-muted">{batch.date} 星期{batch.label}</b>
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

              <div data-sweet-case-notices data-sweet-case-toc-target className="mt-2">
                <div data-case-tabs role="tablist" aria-label="通告状态" className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    role="tab"
                    data-case-tab="promo"
                    aria-selected={board === 'promo'}
                    onClick={() => setBoard('promo')}
                    className={sweetTabClass(board === 'promo')}
                  >
                    宣传中 <span className="tabular-nums">{promoGroups.reduce((sum, group) => sum + group.items.reduce((n, item) => n + item.casts.length, 0), 0)}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    data-case-tab="open"
                    aria-selected={board === 'open'}
                    onClick={() => setBoard('open')}
                    className={sweetTabClass(board === 'open')}
                  >
                    筹备中 <span className="tabular-nums">{save.notices.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    data-case-tab="shooting"
                    aria-selected={board === 'shooting'}
                    onClick={() => setBoard('shooting')}
                    className={sweetTabClass(board === 'shooting')}
                  >
                    拍摄中 <span className="tabular-nums">{save.shooting.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    data-case-tab="waiting"
                    aria-selected={board === 'waiting'}
                    onClick={() => setBoard('waiting')}
                    className={sweetTabClass(board === 'waiting')}
                  >
                    等待上市 <span className="tabular-nums">{save.waiting.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    data-case-tab="hot"
                    aria-selected={board === 'hot'}
                    onClick={() => setBoard('hot')}
                    className={sweetTabClass(board === 'hot')}
                  >
                    热卖中 <span className="tabular-nums">{save.hot.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    data-case-tab="done"
                    aria-selected={board === 'done'}
                    onClick={() => setBoard('done')}
                    className={sweetTabClass(board === 'done')}
                  >
                    已完成 <span className="tabular-nums">{save.done.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    data-case-tab="self-made"
                    aria-selected={board === 'selfMade'}
                    onClick={() => setBoard('selfMade')}
                    className={sweetTabClass(board === 'selfMade')}
                  >
                    自制通告及其他 <span className="tabular-nums">{save.selfMade.length}</span>
                  </button>
                </div>
                {board === 'promo'
                  ? <SweetPromoPanel groups={promoGroups} />
                  : board === 'open'
                    ? <SweetNoticePanel save={save} genders={genders} />
                    : board === 'shooting'
                      ? <SweetShootingPanel notices={save.shooting} />
                      : board === 'waiting'
                        ? <SweetWaitingPanel notices={save.waiting} />
                        : board === 'hot'
                          ? <SweetWaitingPanel
                              notices={save.hot}
                              emptyTitle="没有热卖中的作品"
                              emptyText="只列旗下艺人已参演、已到发行日且还没下架的作品。"
                            />
                          : board === 'selfMade'
                            ? <SweetSelfMadePanel
                                notices={save.selfMade}
                                emptyTitle="还没有自制作品"
                                emptyText="这份存档的 CaseCreate 段里没有自制通告。自己制作唱片或戏剧之后再读一次。"
                              />
                            : <SweetDonePanel notices={save.done} />}
              </div>
            </>
          )}
        </div>
      </div>

      {save && !busy && (
        <aside className="fixed right-4 top-[76px] z-10 max-h-[calc(100vh-92px)] w-[248px] flex-col gap-2 hidden min-[1120px]:flex">
          <div className="shrink-0">
            <SweetCaseToc save={save} />
          </div>
          <SweetArtistQuickRef save={save} />
        </aside>
      )}
    </div>
  );
}
