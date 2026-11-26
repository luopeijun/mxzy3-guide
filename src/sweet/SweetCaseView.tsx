import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import {
  formatSweetDate, parseSweetSave, SWEET_ABILITY_LABELS, type SweetSave,
} from '../lib/sweetCaseParser';

/** 与明星志愿3 存档解析同款的小结块：右侧固定，默认收成一行，点开才列条目。 */
function SweetCaseToc({ save }: { save: SweetSave }) {
  const [active, setActive] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const entries = useMemo(() => [
    { id: 'clock', label: '游戏时间', selector: '[data-sweet-case-clock]', summary: formatSweetDate(save.date) },
    { id: 'company', label: '公司', selector: '[data-sweet-case-company]', summary: `主角 ${save.protagonist || '未记录'}` },
    { id: 'artists', label: '我方艺人', selector: '[data-sweet-case-artists]', summary: `${save.artists.length} 位` },
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

/** 甜蜜乐章存档解析：第一步只做游戏时间、公司与艺人卡片。 */
export default function SweetCaseView() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [save, setSave] = useState<SweetSave | null>(null);
  const [stars, setStars] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/sweet/star-roles.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('艺人表加载失败'))))
      .then((data: { stars?: Record<string, string> }) => setStars(data.stars ?? {}))
      .catch(() => setError('艺人表加载失败，艺人姓名可能显示为编号。'));
  }, []);

  const receive = async (file?: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setError('');
    setSave(null);
    setBusy(true);
    try {
      setSave(await parseSweetSave(file, stars));
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
                          <span className="text-ui-xs font-bold text-brand-strong">#{artist.id} {artist.name}</span>
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
                      </article>
                    </div>
                  ))}
                </div>
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
