import { useMemo, useState } from 'react';
import type { SpecialsData } from '../../types/specials';
import { ATTRIBUTES, CERT_REQUIREMENTS, COURSE_LEVELS } from '../../lib/specials';
import {
  certGaps, certKey, certsForArtist, courseEntriesForArtist,
  type SpecialsState,
} from '../../lib/specialsState';
import { CERT_TONE } from '../tips/tipsData';
import { cn } from '../../lib/cn';
import type { ArtistOption } from './NoticeCard';

interface Props {
  data: SpecialsData;
  state: SpecialsState;
  artists: ArtistOption[];
  onStat: (artistId: string, attr: string, value: number | null) => void;
  onCourse: (artistId: string, course: string) => void;
  onCheck: (key: string) => void;
}

/** One place to enter numbers. Attributes are all ten (填一次全站共用);
 *  courses are on-demand — only the certificates behind this artist's enabled
 *  notices appear, because nobody wants to maintain 4 × 10 grades. */
export default function ArtistStatePanel({ data, state, artists, onStat, onCourse, onCheck }: Props) {
  const [selected, setSelected] = useState('');
  const [showAll, setShowAll] = useState(false);
  const artistId = artists.some((artist) => artist.id === selected)
    ? selected
    : artists[0]?.id ?? '';
  const entries = useMemo(
    () => courseEntriesForArtist(data, state, artistId),
    [data, state, artistId],
  );
  const certs = useMemo(
    () => certsForArtist(data, state, artistId),
    [data, state, artistId],
  );
  const needed = entries.filter((entry) => entry.needed);
  const visible = showAll ? entries : needed;
  const artist = artists.find((item) => item.id === artistId);

  if (!artistId) {
    return (
      <section className="rounded-ui-md border border-line bg-surface px-4 py-3 shadow-soft">
        <h2 className="text-ui-sm font-bold text-brand-strong">艺人状态录入</h2>
        <p className="mt-1.5 text-ui-xs text-ink-faint">
          旗下还没有艺人。先到<a href="#/tracker" className="text-brand hover:underline">事件追踪器</a>选好 4 人，再回来填属性与课程。
        </p>
      </section>
    );
  }

  return (
    <section data-artist-panel className="rounded-ui-md border border-line bg-surface shadow-soft">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-ui-sm font-bold text-brand-strong">艺人状态录入</h2>
        <span className="text-ui-2xs text-ink-faint">属性填一次全站共用；课程只列本轮挂的通告要的证书</span>
        <div className="ml-auto flex flex-wrap gap-1.5" data-artist-switch>
          {artists.map((item) => (
            <button
              key={item.id}
              type="button"
              data-artist-tab
              data-artist-id={item.id}
              data-active={item.id === artistId ? 'yes' : 'no'}
              onClick={() => setSelected(item.id)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-ui-2xs transition-colors',
                item.id === artistId
                  ? 'bg-brand-soft font-semibold text-brand-strong'
                  : 'bg-surface-soft text-ink-faint hover:text-brand-strong',
              )}
            >
              {item.avatar && (
                <img src={`${import.meta.env.BASE_URL}${item.avatar}`} alt="" className="h-4 w-4 rounded-full object-cover" />
              )}
              {item.title}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 px-4 py-4 tab:grid-cols-1">
        {/* Attributes */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-ui-xs font-semibold text-ink">属性数值</h3>
            <span className="text-ui-2xs text-ink-faint">10 项 · 未填视为「未录入」</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 cramped:grid-cols-4 phone:grid-cols-3">
            {ATTRIBUTES.map((attr) => {
              const value = state.stats[artistId]?.[attr.key];
              return (
                <label key={attr.key} data-stat-cell data-stat-key={attr.key} className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-ui-2xs text-ink-muted" title={attr.hint ?? attr.key}>
                    {attr.key}
                    {attr.max === 5 && <span className="ml-0.5 text-brand">*</span>}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={attr.max}
                    value={value ?? ''}
                    placeholder="—"
                    data-stat-input
                    data-artist-id={artistId}
                    data-stat-key={attr.key}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw === '') {
                        onStat(artistId, attr.key, null);
                        return;
                      }
                      const parsed = Number(raw);
                      onStat(artistId, attr.key, Math.min(attr.max, Math.max(0, parsed)));
                    }}
                    className="w-full rounded-ui-xs border border-line-strong bg-surface px-1.5 py-1 text-ui-xs tabular-nums text-ink focus:border-brand focus:outline-none"
                  />
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-ui-2xs text-ink-faint">* 人气是 0–5 的等级，不是 0–999 的数值。</p>
        </div>

        {/* Courses, derived from enabled notices */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-ui-xs font-semibold text-ink">按需课程进度</h3>
            <button
              type="button"
              data-show-all-courses
              aria-expanded={showAll}
              onClick={() => setShowAll((value) => !value)}
              className="ml-auto text-ui-2xs text-brand hover:underline"
            >
              {showAll ? '只看本轮用到的' : '显示全部 10 门'}
            </button>
          </div>

          {certs.length === 0 ? (
            <p className="rounded-ui-sm bg-surface-soft px-3 py-3 text-ui-2xs text-ink-faint">
              {artist?.title ?? '这位艺人'}本轮没有挂任何启用的通告，暂时不用录课程。
              给通告卡勾「本次做」并指派到他，这里会自动列出该证书要的几门课。
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {certs.map((cert) => {
                const gaps = certGaps(cert, artistId, state);
                const held = (state.values[certKey(cert, artistId)] ?? 0) >= 1;
                const requirement = CERT_REQUIREMENTS.find((row) => row.cert === cert);
                return (
                  <div key={cert} data-cert-block data-cert={cert} className="rounded-ui-sm border border-line px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-ui-2xs font-semibold', CERT_TONE[cert] ?? 'bg-surface-soft text-ink-muted')}>
                        {cert}
                      </span>
                      <span className="text-ui-2xs text-ink-faint">
                        {gaps.length ? `还差 ${gaps.length} 项` : '属性与课程已凑齐'}
                      </span>
                      <button
                        type="button"
                        data-cert-check
                        data-cert={cert}
                        onClick={() => onCheck(certKey(cert, artistId))}
                        className={cn(
                          'ml-auto rounded-full px-2 py-0.5 text-ui-2xs',
                          held ? 'bg-growth-soft font-semibold text-growth-strong' : 'bg-surface text-ink-faint ring-1 ring-line-strong',
                        )}
                      >
                        {held ? '✓ 已取得' : '○ 未取得'}
                      </button>
                    </div>
                    <p className="mt-1 text-ui-2xs text-ink-faint">
                      属性门槛：{requirement?.attrs.map((item) => `${item.name} ${item.min}`).join(' / ') ?? '—'}
                      {requirement?.courseNote ? ` · ${requirement.courseNote}` : ''}
                    </p>
                    {gaps.length > 0 && (
                      <p className="mt-0.5 text-ui-2xs text-note" data-cert-gaps>{gaps.join(' · ')}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-1.5" data-course-list>
            {visible.map((entry) => (
              <button
                key={entry.name}
                type="button"
                data-course-button
                data-course={entry.name}
                data-course-needed={entry.needed ? 'yes' : 'no'}
                data-course-level={entry.current}
                onClick={() => onCourse(artistId, entry.name)}
                title={`${entry.cert} · 需 ${entry.required} · 点击切换等级（${COURSE_LEVELS.join(' → ')}）`}
                className={cn(
                  'rounded-ui-xs border px-2 py-1 text-left text-ui-2xs',
                  !entry.needed
                    ? 'border-line bg-surface-soft text-ink-faint opacity-60'
                    : COURSE_LEVELS.indexOf(entry.current) >= COURSE_LEVELS.indexOf(entry.required)
                      ? 'border-growth-line bg-growth-soft text-growth-strong'
                      : 'border-line-strong bg-surface text-ink-muted hover:border-brand-line',
                )}
              >
                <span className="font-semibold">{entry.name}</span>
                <span className="ml-1">{entry.current}</span>
                <span className="ml-1 text-ink-faint">/ 需 {entry.required}</span>
              </button>
            ))}
            {!visible.length && (
              <span className="text-ui-2xs text-ink-faint">本轮没有需要录入的课程。</span>
            )}
          </div>
          <p className="mt-1.5 text-ui-2xs text-ink-faint">
            点课程名循环「未上 → 初级 → 中级 → 高级 → 专业」。等级不从属性自动派生：属性够只代表够格升级，不代表实际上过课。
          </p>
        </div>
      </div>
    </section>
  );
}
