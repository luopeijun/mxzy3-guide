import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import {
  formatSweetDate, parseSweetSave, SWEET_ABILITY_LABELS, SWEET_NOTICE_LABELS,
  type SweetAward, type SweetEvent, type SweetSave, type SweetTeam,
} from '../lib/sweetCaseParser';

/** 称号徽标跟主站同一套分线配色；line 来自 case-tables.json 的 titleMeta。 */
const TITLE_LINE_CLASS: Record<string, string> = {
  music: 'border-title-music-line bg-title-music-soft text-title-music',
  host: 'border-title-host-line bg-title-host-soft text-title-host',
  model: 'border-title-model-line bg-title-model-soft text-title-model',
  screen: 'border-title-screen-line bg-title-screen-soft text-title-screen',
  star: 'border-title-star-line bg-title-star-soft text-title-star',
  other: 'border-title-other-line bg-title-other-soft text-title-other',
};

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

/** 与明星志愿3 存档解析同款的小结块：右侧固定，默认收成一行，点开才列条目。 */
function SweetCaseToc({ save }: { save: SweetSave }) {
  const [active, setActive] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const entries = useMemo(() => [
    { id: 'clock', label: '游戏时间', selector: '[data-sweet-case-clock]', summary: formatSweetDate(save.date) },
    { id: 'company', label: '公司', selector: '[data-sweet-case-company]', summary: `主角 ${save.protagonist || '未记录'}` },
    { id: 'artists', label: '我方艺人', selector: '[data-sweet-case-artists]', summary: `${save.artists.length} 位` },
    { id: 'teams', label: '我方团体', selector: '[data-sweet-case-teams]', summary: `${save.teams.length} 个` },
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

/** 甜蜜乐章存档解析：游戏时间 / 公司 / 艺人卡片与合约信息。 */
export default function SweetCaseView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [save, setSave] = useState<SweetSave | null>(null);
  const [stars, setStars] = useState<Record<string, string>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [titleMeta, setTitleMeta] = useState<Record<string, { line?: string }>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/sweet/star-roles.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('艺人表加载失败'))))
      .then((data: { stars?: Record<string, string> }) => setStars(data.stars ?? {}))
      .catch(() => setError('艺人表加载失败，艺人姓名可能显示为编号。'));
    // 称号沿用游戏 Nickname.tab 的烘焙表（和主站同一份）；读不到时回退显示编号。
    fetch(`${import.meta.env.BASE_URL}data/case-tables.json?v=${Date.now()}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('称号表加载失败'))))
      .then((data: {
        titles?: Record<string, string>;
        titleMeta?: Record<string, { line?: string }>;
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
      setSave(await parseSweetSave(file, stars, titles));
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
                            const line = titleMeta[String(artist.titleId)]?.line ?? 'other';
                            return (
                              <span
                                data-sweet-case-artist-title
                                data-title-line={line}
                                className={cn(
                                  'rounded-full border px-1.5 text-ui-2xs font-semibold',
                                  TITLE_LINE_CLASS[line] ?? TITLE_LINE_CLASS.other,
                                )}
                              >
                                {artist.title || `称号${artist.titleId}`}
                              </span>
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
