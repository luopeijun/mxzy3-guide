import { useMemo, useState } from 'react';
import AssistantDock from '../ui/AssistantDock';
import FloatingCard, { type HoverAnchor } from '../ui/FloatingCard';
import { useSweetSelfMadeData } from '../hooks/useSweetSelfMadeData';
import { cn } from '../lib/cn';
import type { SweetSave } from '../lib/sweetCaseParser';
import type { SweetSelfMadeData, SweetSelfMadeEntry } from '../types/sweetSelfMade';

/* 甜蜜乐章的自制通告浮窗：列出攻略整理的自制作品一览，按当前旗下艺人筛，
 * 已出现在自制作品列表里的打勾，悬停看条件与数值门槛对比。
 *
 * 「已拿到」＝存档 CaseCreate 段里能读到的自制作品编码（save.selfMade），
 * 和主站同口径：只看作品在列表里，不要求已经制作完成。 */

/** 与存档九项属性同序，用来把门槛标签换成数值下标。 */
const ATTRS = ['演技', '口才', '歌艺', '名气', '仪态', '动感', '体能', '才智', '自信'];
const ATTR_INDEX: Record<string, number> = Object.fromEntries(
  ATTRS.map((name, index) => [name, index]),
);

const EXTRA_GROUP_NAME = '攻略未收录';
const EXTRA_CONDITION = '攻略未收录此条，只能按作品名对上，条件与门槛暂缺。';

interface ArtistView {
  id: number;
  name: string;
  abilities: number[] | null;
}

interface EntryRow {
  entry: SweetSelfMadeEntry;
  owned: boolean;
}

interface ArtistGroup {
  artist: ArtistView;
  entries: EntryRow[];
  owned: number;
}

interface SectionGroup {
  key: string;
  label: string;
  groups: ArtistGroup[];
  owned: number;
  total: number;
}

type HoverState = { entry: SweetSelfMadeEntry; artist: ArtistView; owned: boolean; anchor: HoverAnchor };

function thresholdGap(entry: SweetSelfMadeEntry, artist: ArtistView) {
  return entry.thresholds.map((threshold) => {
    const index = ATTR_INDEX[threshold.label];
    const have = index === undefined ? null : artist.abilities?.[index] ?? null;
    return {
      label: threshold.label,
      need: threshold.value,
      have,
      diff: have === null ? null : Math.max(0, Math.ceil(threshold.value - have)),
    };
  });
}

function SelfMadeList({
  data,
  sections,
  onHover,
}: {
  data: SweetSelfMadeData;
  sections: SectionGroup[];
  onHover: (next: HoverState) => void;
}) {
  if (sections.length === 0) {
    return <p className="pt-2 text-ui-2xs text-ink-faint">当前存档的旗下艺人在自制通告一览里没有对应作品。</p>;
  }
  return (
    <div className="space-y-2.5 pt-2" data-sweet-selfmade-guide-list>
      {sections.map((section) => (
        <div key={section.key} data-sweet-selfmade-guide-section={section.key}>
          <p className="mb-1 flex flex-wrap items-baseline gap-x-1.5 text-ui-2xs font-bold text-brand-strong">
            {section.label}
            <span className="font-normal text-ink-faint tabular-nums">
              {section.owned}/{section.total}
            </span>
          </p>
          <div className="space-y-1.5">
            {section.groups.map((group) => (
              <div key={`${section.key}-${group.artist.id}`} data-sweet-selfmade-guide-artist={group.artist.id}>
                <p className="mb-0.5 flex items-baseline gap-1 text-ui-2xs">
                  <span className="font-semibold text-ink">{group.artist.name}</span>
                  <span className="tabular-nums text-ink-faint">
                    {group.owned}/{group.entries.length}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {group.entries.map(({ entry, owned }) => (
                    <button
                      key={`${entry.code || entry.name}`}
                      type="button"
                      data-sweet-selfmade-guide={entry.code || entry.name}
                      data-sweet-selfmade-guide-owned={owned ? 'true' : 'false'}
                      onMouseEnter={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        onHover({
                          entry,
                          artist: group.artist,
                          owned,
                          anchor: {
                            left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                          },
                        });
                      }}
                      className={cn(
                        'inline-flex cursor-help items-center gap-1 rounded-full border px-1.5 text-ui-2xs transition-colors',
                        owned
                          ? 'border-growth-line bg-growth-soft font-semibold text-growth-strong'
                          : 'border-line bg-surface-soft text-ink-muted hover:border-line-strong hover:text-ink',
                      )}
                    >
                      <span aria-hidden="true" className={owned ? 'text-growth-strong' : 'text-ink-faint'}>
                        {owned ? '✓' : '·'}
                      </span>
                      {entry.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-ui-2xs text-ink-faint">
        共 {data.meta.entryCount} 条攻略条目
        {data.meta.extraCount > 0 && `，另有 ${data.meta.extraCount} 条攻略没收录`}
      </p>
    </div>
  );
}

function HoverCard({
  state,
  onEnter,
  onLeave,
}: {
  state: HoverState;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { entry, artist, owned, anchor } = state;
  const gaps = thresholdGap(entry, artist);
  return (
    <FloatingCard anchor={anchor} onEnter={onEnter} onLeave={onLeave} className="w-[300px] p-2.5 text-ui-2xs">
      <p className="mb-1 flex items-baseline gap-2 text-ui-xs font-semibold text-ink" data-sweet-selfmade-guide-title>
        {entry.name}
        {entry.code && <span className="text-ui-2xs font-normal text-ink-faint">{entry.code}</span>}
        <span
          className={cn(
            'ml-auto text-ui-2xs font-semibold',
            owned ? 'text-growth-strong' : 'text-alert',
          )}
        >
          {owned ? '已拿到' : '未拿到'}
        </span>
      </p>
      <p className="mb-1.5 flex flex-wrap items-baseline gap-1 text-ui-2xs text-ink-faint">
        <span>{artist.name}</span>
        <span>·</span>
        <span>{entry.category}</span>
        {entry.kind && <span>· {entry.kind}</span>}
        {entry.days > 0 && <span>· 累积 {entry.days} 天自由活动</span>}
      </p>
      {entry.tags.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1" data-sweet-selfmade-guide-tags>
          {entry.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-line bg-surface-soft px-1.5 text-ui-2xs text-ink-muted">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="border-t border-line pt-1.5 leading-relaxed text-ink-muted" data-sweet-selfmade-guide-condition>
        <span className="mr-1 font-semibold text-ink">条件</span>
        {entry.guide ? entry.condition : EXTRA_CONDITION}
      </div>
      {entry.guide && entry.guideName && entry.guideName !== entry.name && (
        <p className="mt-1 text-ui-2xs text-ink-faint">攻略里写作《{entry.guideName}》。</p>
      )}
      {gaps.length > 0 && (
        <div className="mt-1.5 border-t border-line pt-1.5" data-sweet-selfmade-guide-thresholds>
          <p className="mb-1 text-ui-2xs font-semibold text-ink">
            数值门槛 <span className="font-normal text-ink-faint">· 当前 {artist.name}</span>
          </p>
          <div className="space-y-0.5">
            {gaps.map((gap) => (
              <div
                key={`${gap.label}-${gap.need}`}
                data-sweet-selfmade-guide-threshold={gap.label}
                className="flex items-baseline gap-1 text-ui-2xs"
              >
                <span className="text-ink-muted">{gap.label}</span>
                <span className="tabular-nums text-ink-faint">需要 {gap.need}</span>
                {gap.have === null ? (
                  <span className="ml-auto text-ink-faint">当前 —</span>
                ) : gap.diff === 0 ? (
                  <span className="ml-auto font-semibold text-growth-strong">当前 {gap.have} · 已达标</span>
                ) : (
                  <span className="ml-auto text-alert">当前 {gap.have} · 差 {gap.diff}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </FloatingCard>
  );
}

export default function SweetSelfMadeAssistant({ save }: { save: SweetSave | null }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const state = useSweetSelfMadeData(open);

  /** 只收当前在册艺人（主角固定 1）+ 「其他」，其余艺人的条目一律不列。 */
  const sections = useMemo<SectionGroup[]>(() => {
    const data = state.data;
    if (!data || !save) return [];
    const ownedCodes = new Set(save.selfMade.map((item) => item.code));
    const roster = new Map(save.artists.map((artist) => [artist.id, artist]));
    const rosterOrder = save.artists.map((artist) => artist.id);

    const view = (entry: SweetSelfMadeEntry): ArtistView => {
      // 攻略没收录的自制品没有归属艺人，单独成组排在每节最后。
      if (!entry.guide) return { id: -1, name: EXTRA_GROUP_NAME, abilities: null };
      if (entry.artistId === 0) return { id: 0, name: '其他', abilities: null };
      const card = roster.get(entry.artistId);
      return {
        id: entry.artistId,
        name: card?.name ?? entry.artist,
        abilities: card?.abilities ?? null,
      };
    };

    const out: SectionGroup[] = [];
    for (const section of data.sections) {
      const groups = new Map<number, ArtistGroup>();
      const bucket = (entry: SweetSelfMadeEntry) => {
        const artist = view(entry);
        const current = groups.get(artist.id)
          ?? { artist, entries: [], owned: 0 };
        const owned = Boolean(entry.code) && ownedCodes.has(entry.code);
        current.entries.push({ entry, owned });
        if (owned) current.owned += 1;
        groups.set(artist.id, current);
      };

      for (const entry of data.entries) {
        if (entry.section !== section.key) continue;
        if (entry.artistId !== 0 && !roster.has(entry.artistId)) continue;
        bucket(entry);
      }
      // 攻略没收录的自制品也挂在同一节里，条件留空；单独成组排在最后。
      const extras = data.extras.filter((entry) => entry.section === section.key);
      for (const entry of extras) bucket(entry);

      const ordered = [...groups.values()].sort((a, b) => {
        const rank = (id: number) => (id <= 0 ? Number.MAX_SAFE_INTEGER : rosterOrder.indexOf(id));
        return rank(a.artist.id) - rank(b.artist.id);
      });
      if (ordered.length === 0) continue;
      out.push({
        key: section.key,
        label: section.label,
        groups: ordered,
        owned: ordered.reduce((sum, group) => sum + group.owned, 0),
        total: ordered.reduce((sum, group) => sum + group.entries.length, 0),
      });
    }
    return out;
  }, [state.data, save]);

  const ownedCount = sections.reduce((sum, section) => sum + section.owned, 0);
  const totalCount = sections.reduce((sum, section) => sum + section.total, 0);

  return (
    <AssistantDock
      label="自制通告一览"
      badge={totalCount > 0 ? `${ownedCount}/${totalCount}` : ''}
      open={open}
      onOpenChange={(next: boolean) => {
        setHover(null);
        setOpen(next);
      }}
      onClose={() => setHover(null)}
      onPanelScroll={() => setHover(null)}
      onDragStart={() => setHover(null)}
      header={(
        <>
          <span className="text-ui-2xs font-semibold text-ink" data-sweet-selfmade-guide-header>
            自制通告一览
          </span>
          {totalCount > 0 && (
            <span className="text-ui-2xs text-ink" data-sweet-selfmade-guide-progress>
              {ownedCount}/{totalCount}
            </span>
          )}
          <span className="ml-auto rounded-full border border-line px-1.5 py-0.5 text-ui-2xs text-ink-faint">
            基于当前存档
          </span>
        </>
      )}
      overlay={open && hover ? (
        <HoverCard
          state={hover}
          onEnter={() => undefined}
          onLeave={() => setHover(null)}
        />
      ) : null}
    >
      {!save && (
        <p className="pt-2 text-ui-2xs text-ink-faint">先载入一份存档，就能看到自制通告拿到了哪些、还差什么。</p>
      )}
      {save && state.error && (
        <p className="pt-2 text-ui-2xs text-alert">自制通告一览读取失败：{state.error}</p>
      )}
      {save && !state.error && !state.data && (
        <p className="pt-2 text-ui-2xs text-ink-faint">正在读取自制通告一览…</p>
      )}
      {save && state.data && (
        <SelfMadeList data={state.data} sections={sections} onHover={setHover} />
      )}
    </AssistantDock>
  );
}
