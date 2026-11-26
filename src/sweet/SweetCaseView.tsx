import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import EmptyState from '../components/EmptyState';
import {
  formatSweetDate, parseSweetSave, SWEET_ABILITY_LABELS, type SweetSave,
} from '../lib/sweetCaseParser';

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
        'fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto bg-canvas',
        dragging && 'ring-2 ring-inset ring-brand',
      )}
    >
      <div className="mx-auto w-full max-w-[1200px] px-8 pt-3 pb-10 nav:px-5">
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
          {fileName ? (
            <span
              data-sweet-case-file
              className="max-w-[320px] truncate text-ui-2xs text-ink-muted"
              title={fileName}
            >
              {fileName}
            </span>
          ) : (
            <span className="text-ui-2xs text-ink-faint">
              把甜蜜乐章游戏存档拖到这里，或点上面的按钮选择。
            </span>
          )}
        </div>

        {error && (
          <div data-sweet-case-error className="mt-3 rounded-ui-md border border-brand bg-surface px-3 py-2 text-ui-2xs text-brand">
            {error}
          </div>
        )}

        {busy && (
          <div data-sweet-case-busy className="mt-3 text-ui-2xs text-ink-muted">正在读取存档…</div>
        )}

        {save ? (
          <div data-sweet-case-result className="mt-4 space-y-4">
            <section
              data-sweet-case-company
              className="rounded-ui-md border border-line bg-surface px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-ui-xs font-semibold text-ink">{save.company || '—'}</span>
                <span data-sweet-case-date className="text-ui-2xs text-ink-muted">
                  {formatSweetDate(save.date)}
                </span>
              </div>
              <div className="mt-1 text-ui-2xs text-ink-faint">
                主角：{save.protagonist || '—'}
              </div>
            </section>

            <section data-sweet-case-artists>
              <h2 className="mb-2 text-ui-xs font-semibold text-ink">签约艺人</h2>
              {save.artists.length ? (
                <div className="grid gap-3 phone:grid-cols-1 tab:grid-cols-2">
                  {save.artists.map((artist) => (
                    <article
                      key={artist.id}
                      data-sweet-case-artist={artist.id}
                      className="rounded-ui-md border border-line bg-surface px-4 py-3"
                    >
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <span className="text-ui-xs font-semibold text-ink">{artist.name}</span>
                        <span className="text-ui-2xs text-ink-faint">编号 {artist.id}</span>
                      </div>
                      <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                        {SWEET_ABILITY_LABELS.map((label, index) => (
                          <div key={label} className="flex items-baseline justify-between gap-1">
                            <dt className="text-ui-2xs text-ink-muted">{label}</dt>
                            <dd
                              data-sweet-case-ability={label}
                              className="text-ui-2xs font-medium tabular-nums text-ink"
                            >
                              {artist.abilities[index] ?? 0}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-ui-md border border-line bg-surface px-4 py-3 text-ui-2xs text-ink-faint">
                  这份存档没有签约艺人。
                </div>
              )}
            </section>
          </div>
        ) : (
          !busy && (
            <div data-sweet-case-pending className="mt-3">
              <EmptyState
                title="甜蜜乐章存档解析"
                text="选择或拖入一份 .sav 存档，即可查看游戏时间、公司与签约艺人卡片。"
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}
