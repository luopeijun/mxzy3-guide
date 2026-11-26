import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import type { TitleMeta } from '../lib/caseParser';
import { nextTitle } from '../lib/titleLadder';
import {
  formatSweetDate, parseSweetSave, sweetRoleGender, SWEET_ABILITY_LABELS, SWEET_NOTICE_LABELS,
  type SweetAward, type SweetArtistCard, type SweetCaseTables, type SweetEvent,
  type SweetNotice, type SweetNoticeRole, type SweetSave, type SweetShootingCast,
  type SweetShootingNotice, type SweetShootingOtherCast, type SweetTeam,
} from '../lib/sweetCaseParser';
import EmptyState from '../components/EmptyState';
import { TitleBadge } from '../ui/TitleBadge';

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

function sweetChipClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-ui-2xs transition-colors',
    active
      ? 'border-brand bg-brand font-semibold text-white'
      : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
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

/** 与明星志愿3 存档解析同款的小结块：右侧固定，默认收成一行，点开才列条目。 */
function SweetCaseToc({ save }: { save: SweetSave }) {
  const [active, setActive] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const entries = useMemo(() => [
    { id: 'clock', label: '游戏时间', selector: '[data-sweet-case-clock]', summary: formatSweetDate(save.date) },
    { id: 'company', label: '公司', selector: '[data-sweet-case-company]', summary: `主角 ${save.protagonist || '未记录'}` },
    { id: 'artists', label: '我方艺人', selector: '[data-sweet-case-artists]', summary: `${save.artists.length} 位` },
    { id: 'teams', label: '我方团体', selector: '[data-sweet-case-teams]', summary: `${save.teams.length} 个` },
    { id: 'notices', label: '筹备中通告', selector: '[data-sweet-case-notices]', summary: `${save.notices.length} 条` },
    { id: 'shooting', label: '拍摄中通告', selector: '[data-sweet-case-notices]', summary: `${save.shooting.length} 条` },
  ], [save]);

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
function SweetCaseStat({ label, value, attr }: { label: string; value: string; attr: string }) {
  return (
    <div
      data-sweet-case-company-stat={attr}
      className="rounded-ui-md border border-line bg-surface px-2.5 py-1.5"
    >
      <div className="text-ui-2xs text-ink-faint">{label}</div>
      <div className="mt-0.5 whitespace-nowrap text-ui-sm font-bold tabular-nums text-ink">
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
                      {index > 0 && ' · '}{gap.attr} {formatGap(gap.diff)}
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
  const notices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((notice) => {
      if (category !== 'all' && notice.category !== category) return false;
      if (company !== 'all' && notice.company !== company) return false;
      if (!needle) return true;
      return [notice.name, notice.code, notice.category, notice.company,
        ...notice.roles.map((role) => `${role.role}${role.code}`)]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [all, query, category, company]);
  const dirty = Boolean(query || category !== 'all' || company !== 'all');
  const reset = () => { setQuery(''); setCategory('all'); setCompany('all'); };

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
  const [board, setBoard] = useState<'open' | 'shooting'>('open');

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
                  <SweetCaseStat label="主角" value={save.protagonist || '—'} attr="protagonist" />
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
                            <span key={label} data-sweet-case-notice-count={label} className="rounded px-1 py-0.5 text-ink-faint">
                              {label} <b className="font-semibold text-ink">{artist.noticeCounts[index] ?? 0}</b>
                            </span>
                          ))}
                          <span data-sweet-case-notice-total className="rounded px-1 py-0.5 text-ink-faint">
                            合计 <b className="font-semibold text-ink">{artist.noticeCounts.reduce((sum, n) => sum + n, 0)}</b>
                          </span>
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

              <div data-sweet-case-notices data-sweet-case-toc-target className="mt-2">
                <div data-case-tabs role="tablist" aria-label="通告状态" className="flex flex-wrap items-center gap-1.5">
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
                </div>
                {board === 'open'
                  ? <SweetNoticePanel save={save} genders={genders} />
                  : <SweetShootingPanel notices={save.shooting} />}
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
        </aside>
      )}
    </div>
  );
}
