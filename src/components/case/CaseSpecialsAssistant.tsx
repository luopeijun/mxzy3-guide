import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSpecialsData } from '../../hooks/useSpecialsData';
import { useSelfMadeData } from '../../hooks/useSelfMadeData';
import AssistantDock from '../../ui/AssistantDock';
import { cn } from '../../lib/cn';
import { workRoleClass } from '../../lib/workRoleStyle';
import type { SelfMadeData, SelfMadeEntry, SelfMadeThreshold } from '../../types/selfmade';
import {
  evaluateLiveSpecials,
  SINGLE_ROLE_NOTICES,
  type ArtistMatch,
  type CertMatch,
  type CertMatchGuide,
  type GroupMatch,
  type ItemCheck,
  type LiveSpecialsReport,
} from '../../lib/caseSpecials';
import type { CaseTables, ParseResult } from '../../lib/caseParser';
import { ATTRS } from '../../lib/caseParser';

interface Props {
  result: ParseResult | null;
  tables: CaseTables;
}

type HoverAnchor = { left: number; right: number; top: number; bottom: number };

type HoverState =
  | { kind: 'match'; match: ArtistMatch; hideSlotLabel: boolean; anchor: HoverAnchor }
  | { kind: 'group'; group: GroupMatch; anchor: HoverAnchor }
  | { kind: 'certGuide'; cert: string; guide: CertMatchGuide; anchor: HoverAnchor }
  | { kind: 'certPerson'; cert: string; guide: CertMatchGuide; person: string; anchor: HoverAnchor }
  | { kind: 'item'; item: ItemCheck; anchor: HoverAnchor }
  | { kind: 'selfmade'; entry: SelfMadeEntry; artist: SelfMadeArtistView; owned: boolean; anchor: HoverAnchor };

/** 自制通告某一条挂在谁名下：旗下艺人（带数值）或「其他」（无归属）。 */
interface SelfMadeArtistView {
  id: number | null;
  name: string;
  abilities: number[] | null;
  friendship: number | null;
  gifts: number | null;
}

/** 统一的 hover 浮层：优先贴在锚点上方，空间不够再翻到下方；最后夹在视口内。 */
function FloatingCard({
  anchor,
  onEnter,
  onLeave,
  className,
  children,
}: {
  anchor: HoverAnchor;
  onEnter: () => void;
  onLeave: () => void;
  className?: string;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const { width, height } = card.getBoundingClientRect();
    const padding = 8;
    const gap = 8;
    const maxLeft = Math.max(padding, window.innerWidth - width - padding);
    const left = Math.min(Math.max(padding, anchor.right - width), maxLeft);
    let top = anchor.top - height - gap;
    if (top < padding) top = anchor.bottom + gap;
    if (top + height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - height - padding);
    }
    setPosition({ left, top });
  }, [anchor.left, anchor.right, anchor.top, anchor.bottom]);

  return (
    <div
      ref={cardRef}
      data-case-special-hover
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn(
        'fixed z-50 max-h-[calc(100vh-16px)] overflow-y-auto rounded-ui-md border border-line-strong bg-canvas shadow-soft',
        className,
      )}
      style={position
        ? { left: position.left, top: position.top }
        : { left: -9999, top: -9999, visibility: 'hidden' }}
    >
      {children}
    </div>
  );
}

function shortValue(value: number): string {
  return String(Number(value.toFixed(1)));
}

/** 艺人胶囊的自定义 hover 浮层：男主角 / 男配角两坑位各自列差值。 */
function MatchHoverCard({
  match,
  hideSlotLabel,
  anchor,
  onEnter,
  onLeave,
}: {
  match: ArtistMatch;
  hideSlotLabel: boolean;
  anchor: HoverAnchor;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <FloatingCard
      anchor={anchor}
      onEnter={onEnter}
      onLeave={onLeave}
      className="w-[300px] p-2.5"
    >
      <p className="mb-1.5 flex items-center gap-2 text-ui-xs font-semibold text-ink">
        {match.name}
        {hideSlotLabel && match.slots.length > 0 && (
          <span className="text-ui-2xs font-normal text-ink-faint">
            {match.slots.map((slot) => `${slot.met}/${slot.total}`).join(' · ')}
          </span>
        )}
      </p>
      {match.required.length > 0 && (
        <div className="mb-1.5 border-b border-line pb-1.5" data-case-special-required>
          <p className="mb-0.5 flex items-center gap-1 text-ui-2xs font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-strong" />
            硬性前置
          </p>
          {match.required.map((entry, index) => (
            <div
              key={`${entry.name}-${index}`}
              className={cn('text-ui-2xs', entry.met ? 'font-semibold text-growth-strong' : 'text-ink-muted')}
            >
              {entry.met ? '✓ ' : ''}{entry.detail}
            </div>
          ))}
        </div>
      )}
      {match.optional.length > 0 && (
        <div className="mb-1.5 border-b border-line pb-1.5" data-case-special-optional>
          <p className="mb-0.5 flex items-center gap-1 text-ui-2xs font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
            可选前置
          </p>
          {match.optional.map((entry, index) => (
            <div
              key={`${entry.name}-${index}`}
              className={cn('text-ui-2xs', entry.met ? 'font-semibold text-growth-strong' : 'text-ink-muted')}
            >
              {entry.met ? '✓ ' : ''}{entry.detail}
            </div>
          ))}
        </div>
      )}
      {match.slots.length ? match.slots.map((slot) => (
        <div key={slot.label} className="mb-1.5 last:mb-0">
          {!hideSlotLabel && (
            <div className="mb-0.5 flex items-center gap-2">
              <span className={cn('text-ui-2xs', workRoleClass(slot.label))}>{slot.label}</span>
              <span className="text-ui-2xs text-ink-faint">{slot.met}/{slot.total}</span>
            </div>
          )}
          {slot.gaps.length ? (
            <div className="space-y-0.5 text-ui-2xs leading-relaxed text-ink-muted">
              {slot.gaps.map((gap, index) => <div key={index}>· {gap}</div>)}
            </div>
          ) : (
            <div className="text-ui-2xs text-growth-strong">全部达标</div>
          )}
        </div>
      )) : (
        <p className="text-ui-2xs text-ink-muted">
          {match.gaps.length ? `待补：${match.gaps.join('、')}` : '全部达标'}
        </p>
      )}
      {match.roleCerts.length > 0 && (
        <div className="mt-1.5 border-t border-line pt-1.5" data-case-special-role-certs>
          <p className="mb-1 text-ui-2xs font-semibold text-ink">角色证书</p>
          {match.roleCerts.map((role) => (
            <div key={role.label} className="mb-1 last:mb-0" data-case-special-role-cert={role.label}>
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className={cn('text-ui-2xs', workRoleClass(role.label))}>{role.label}</span>
                <span className={cn(
                  'text-ui-2xs',
                  role.met ? 'font-semibold text-growth-strong' : 'text-ink-faint',
                )}>
                  {role.met ? '✓ 证书齐备' : '证书未齐'}
                </span>
              </div>
              {role.certs.map((cert) => (
                <div
                  key={cert.name}
                  className={cn(
                    'text-ui-2xs leading-relaxed',
                    cert.met ? 'font-semibold text-growth-strong' : 'text-ink-muted',
                  )}
                >
                  {cert.met ? '✓ ' : '· 缺 '}{cert.name}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </FloatingCard>
  );
}

/** 团体匹配浮层：银河这类团体数值只看队长，逐项显示队长的当前值 / 门槛。 */
function GroupHoverCard({
  group,
  anchor,
  onEnter,
  onLeave,
}: {
  group: GroupMatch;
  anchor: HoverAnchor;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <FloatingCard anchor={anchor} onEnter={onEnter} onLeave={onLeave} className="w-[300px] p-2.5">
      <p className="mb-1.5 text-ui-xs font-semibold text-ink">
        {group.name}
        {group.leaderName && (
          <span className="ml-2 text-ui-2xs font-normal text-ink-faint">队长 {group.leaderName}</span>
        )}
      </p>
      {group.certs.length > 0 && (
        <div className="mb-1.5 border-b border-line pb-1.5" data-case-special-group-certs>
          <p className="mb-0.5 flex items-center gap-1 text-ui-2xs font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-strong" />
            {group.certLabel}
          </p>
          <div className="flex flex-wrap gap-1">
            {group.certs.map((member, index) => (
              <span
                key={`${member.name}-${index}`}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-ui-2xs',
                  member.met
                    ? 'border-growth-line bg-growth-soft font-semibold text-growth-strong'
                    : 'border-line bg-surface-soft text-ink-muted',
                )}
              >
                {member.met && <span aria-hidden="true">✓</span>}
                {member.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {group.checks.length > 0 && (
        <div className="mb-1.5 border-b border-line pb-1.5">
          <p className="mb-0.5 flex items-center gap-1 text-ui-2xs font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />
            团体条件
          </p>
          <div className="space-y-0.5 text-ui-2xs leading-relaxed">
            {group.checks.map((check, index) => (
              <div key={index} className={cn(check.met ? 'text-growth-strong' : 'text-ink-muted')}>
                {check.met ? '✓ ' : '· '}{check.text}
              </div>
            ))}
          </div>
        </div>
      )}
      {group.stats.length > 0 && (
        <div>
          <p className="mb-0.5 flex items-center gap-1 text-ui-2xs font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-strong" />
            队长数值
          </p>
          <div className="space-y-0.5 text-ui-2xs leading-relaxed">
            {group.stats.map((stat, index) => (
              <div key={index} className={cn(stat.met ? 'text-growth-strong' : 'text-ink-muted')}>
                {stat.met ? '✓ ' : '· '}{stat.text}
              </div>
            ))}
          </div>
        </div>
      )}
      {group.certs.length === 0 && group.checks.length === 0 && group.stats.length === 0 && (
        <p className="text-ui-2xs text-ink-muted">
          {group.gaps.length ? `待补：${group.gaps.join('、')}` : '全部达标'}
        </p>
      )}
    </FloatingCard>
  );
}

/** 证书说明浮层：证书名上显示学院课程与属性门槛。 */
function CertGuideCard({
  cert,
  guide,
  anchor,
  onEnter,
  onLeave,
}: {
  cert: string;
  guide: CertMatchGuide;
  anchor: HoverAnchor;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <FloatingCard
      anchor={anchor}
      onEnter={onEnter}
      onLeave={onLeave}
      className="w-[290px] p-2.5"
    >
      <p className="mb-1 text-ui-xs font-semibold text-ink">{cert}</p>
      <p className="mb-1 text-ui-2xs font-semibold text-brand-strong">{guide.academy}</p>
      <div className="space-y-0.5 text-ui-2xs leading-relaxed text-ink-muted">
        {guide.courses.map((course) => <div key={course}>· {course}</div>)}
      </div>
      <div className="mt-1.5 border-t border-line pt-1.5 text-ui-2xs text-ink-muted">
        <span className="font-semibold text-ink">{guide.title}：</span>
        {guide.stats.map((stat) => `${stat.name}${stat.min}+`).join('、')}
      </div>
    </FloatingCard>
  );
}

/** 证书艺人浮层：只列该艺人的属性对比；打钩仍只看是否真的持有证书。 */
function CertPersonCard({
  guide,
  person,
  anchor,
  onEnter,
  onLeave,
}: {
  guide: CertMatchGuide;
  person: string;
  anchor: HoverAnchor;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <FloatingCard
      anchor={anchor}
      onEnter={onEnter}
      onLeave={onLeave}
      className="w-[250px] p-2.5"
    >
      <p className="mb-1.5 text-ui-xs font-semibold text-ink">{person}</p>
      <div className="space-y-0.5">
        {guide.stats.map((stat) => {
          const satisfied = stat.have >= stat.min;
          return (
            <div
              key={stat.name}
              className={cn('text-ui-2xs', satisfied ? 'font-semibold text-growth-strong' : 'text-ink')}
            >
              {satisfied && <span aria-hidden="true">✓ </span>}
              {stat.name} {shortValue(stat.have)}/{stat.min}
            </div>
          );
        })}
      </div>
    </FloatingCard>
  );
}

/** 道具胶囊 hover：只显示条件表里的获得方法。 */
function ItemHoverCard({
  item,
  anchor,
  onEnter,
  onLeave,
}: {
  item: ItemCheck;
  anchor: HoverAnchor;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <FloatingCard
      anchor={anchor}
      onEnter={onEnter}
      onLeave={onLeave}
      className="w-[260px] p-2.5"
    >
      <p className="mb-1 text-ui-xs font-semibold text-ink">{item.name}</p>
      <p className="text-ui-2xs leading-relaxed text-ink-muted">
        {item.hint || '获得方法未记录'}
      </p>
    </FloatingCard>
  );
}

/** 节点正文：「书名号」里的歌曲 / 剧本是重点奖励，用金色区分。 */
function NodeText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(「[^」]+」)/g).map((part, index) => part.startsWith('「') && part.endsWith('」')
        ? <span key={index} className="font-semibold text-title-star">{part}</span>
        : <span key={index}>{part}</span>)}
    </>
  );
}

function DetailSection({
  report,
  expanded,
  onToggle,
  onMatchHover,
  onGroupHover,
  onCertGuideHover,
  onCertPersonHover,
  onItemHover,
  onHoverLeave,
  dataError,
}: {
  report: LiveSpecialsReport | null;
  expanded: string;
  onToggle: (id: string) => void;
  onMatchHover: (match: ArtistMatch, hideSlotLabel: boolean, anchor: HoverAnchor) => void;
  onGroupHover: (group: GroupMatch, anchor: HoverAnchor) => void;
  onCertGuideHover: (cert: string, guide: CertMatchGuide, anchor: HoverAnchor) => void;
  onCertPersonHover: (cert: string, guide: CertMatchGuide, person: string, anchor: HoverAnchor) => void;
  onItemHover: (item: ItemCheck, anchor: HoverAnchor) => void;
  onHoverLeave: () => void;
  dataError: string | null;
}) {
  if (dataError) {
    return <p className="px-1 py-4 text-ui-2xs text-alert">条件表读取失败：{dataError}</p>;
  }
  if (!report) {
    return <p className="px-1 py-4 text-ui-2xs text-ink-faint">正在读取六大目标条件…</p>;
  }

  return (
    <div className="space-y-1">
      {report.notices.map((item) => {
        const open = expanded === item.notice.id;
        const manual = item.conditions.filter((condition) => condition.state === 'manual');
        const filmed = item.filmed;
        const certGroups = new Map<string, {
          guides: CertMatchGuide[];
          people: { match: ArtistMatch; cert: CertMatch }[];
        }>();
        for (const match of item.matches) {
          for (const cert of match.certs) {
            const group = certGroups.get(cert.name) ?? { guides: cert.guides, people: [] };
            group.people.push({ match, cert });
            certGroups.set(cert.name, group);
          }
        }

        return (
          <div
            key={item.notice.id}
            data-case-special-notice={item.notice.id}
            data-case-special-status={item.status}
            data-case-special-filmed={filmed.length > 0 ? 'true' : 'false'}
            className="rounded-ui-sm border border-line bg-surface"
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggle(item.notice.id)}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-soft"
            >
              {filmed.length > 0 ? (
                <span aria-hidden="true" className="shrink-0 text-ui-sm font-semibold text-growth-strong">✓</span>
              ) : (
                <i className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-strong" />
              )}
              <span className="w-[92px] shrink-0 truncate text-ui-xs font-semibold text-ink">
                {item.notice.title}
              </span>
              <span className="flex-1" />
              <span
                className={cn(
                  'w-[60px] shrink-0 text-right text-ui-2xs',
                  filmed.length > 0 ? 'font-semibold text-growth-strong' : 'text-ink-muted',
                )}
              >
                {filmed.length > 0 ? '已拍摄' : '推进中'}
              </span>
              <span className="w-3 shrink-0 text-center text-ui-2xs text-ink-faint">
                {open ? '−' : '+'}
              </span>
            </button>

            {open && (
              <div className="border-t border-line px-2.5 pb-2.5 pt-2">
                {filmed.length > 0 && (
                  <div className="mb-2 border-b border-line pb-2 text-ui-2xs leading-relaxed" data-case-special-filmed-record>
                    <p className="mb-1 flex items-baseline gap-1.5 text-ui-xs font-bold text-ink">
                      <span aria-hidden="true">✓</span>
                      <span>已拍摄</span>
                      {filmed[0]?.date && <span className="font-normal text-ink-faint">{filmed[0].date}</span>}
                    </p>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      {filmed.map((record, index) => (
                        <span key={`${record.name}-${record.date}-${record.role}-${index}`} className="inline-flex items-baseline gap-1">
                          {record.role && <span className={workRoleClass(record.role)}>{record.role}</span>}
                          <span className={cn('text-ui-2xs', record.own ? 'font-bold text-ink' : 'font-normal text-ink-faint')}>
                            {record.own && <span aria-hidden="true" className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle" />}
                            {record.name}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(item.nodes.length > 0 || manual.length > 0) && (
                  <div className="mb-2" data-case-special-nodes>
                    <p className="mb-1 text-ui-2xs font-semibold text-ink">
                      关键事件节点 <span className="font-normal text-ink-faint">· 存档无法判定</span>
                    </p>
                    <div className="space-y-1 text-ui-2xs leading-relaxed text-ink-muted">
                      {item.nodes.length > 0
                        ? item.nodes.map((row, index) => (
                          <div key={row.id} data-case-special-node={row.id} className="flex gap-1.5">
                            <span className="shrink-0 text-ink-faint">{index + 1}.</span>
                            <span>
                              {row.target !== '-' && row.target && (
                                <span className="mr-1 rounded bg-brand-soft px-1 font-semibold text-brand-strong">{row.target}</span>
                              )}
                              <NodeText text={row.name} />
                            </span>
                          </div>
                        ))
                        : manual.map((condition, index) => (
                          <div key={condition.row.id} data-case-special-node={condition.row.id} className="flex gap-1.5">
                            <span className="shrink-0 text-ink-faint">{index + 1}.</span>
                            <span>{condition.row.name}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {[...certGroups].map(([certName, group]) => {
                  const guide = group.guides[0];
                  return (
                    <div key={certName} className="mt-2 flex flex-wrap items-center gap-1" data-case-special-certs>
                      {guide ? (
                        <span
                          data-case-special-cert-guide={certName}
                          className="mr-0.5 cursor-help text-ui-2xs text-ink-faint"
                          onMouseEnter={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            onCertGuideHover(certName, guide, {
                              left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                            });
                          }}
                          onMouseLeave={onHoverLeave}
                        >
                          {certName}
                        </span>
                      ) : (
                        <span className="mr-0.5 text-ui-2xs text-ink-faint">{certName}</span>
                      )}
                      {group.people.map(({ match, cert }) => {
                        const personGuide = cert.guides[0] ?? guide;
                        return personGuide ? (
                          <span
                            key={match.id}
                            data-case-special-cert={match.name}
                            data-case-special-cert-met={cert.met}
                            className={cn(
                              'cursor-help inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-ui-2xs',
                              cert.met
                                ? 'border-growth-line bg-growth-soft font-semibold text-growth-strong'
                                : 'border-line bg-surface-soft text-ink-muted',
                            )}
                            onMouseEnter={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              onCertPersonHover(certName, personGuide, match.name, {
                                left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                              });
                            }}
                            onMouseLeave={onHoverLeave}
                          >
                            {cert.met && <span aria-hidden="true">✓</span>}
                            {match.name}
                          </span>
                        ) : (
                          <span
                            key={match.id}
                            data-case-special-cert={match.name}
                            data-case-special-cert-met={cert.met}
                            className={cn(
                              'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-ui-2xs',
                              cert.met
                                ? 'border-growth-line bg-growth-soft font-semibold text-growth-strong'
                                : 'border-line bg-surface-soft text-ink-muted',
                            )}
                          >
                            {cert.met && <span aria-hidden="true">✓</span>}
                            {match.name}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}

                {item.items.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1" data-case-special-items>
                    <span className="mr-0.5 text-ui-2xs text-ink-faint">所需道具</span>
                    {item.items.map((entry) => (
                      <span
                        key={entry.name}
                        data-case-special-item={entry.name}
                        data-case-special-item-met={entry.met}
                        className={cn(
                          'cursor-help inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-ui-2xs',
                          entry.met
                            ? 'border-growth-line bg-growth-soft font-semibold text-growth-strong'
                            : 'border-line bg-surface-soft text-ink-muted',
                        )}
                        onMouseEnter={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          onItemHover(entry, {
                            left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                          });
                        }}
                        onMouseLeave={onHoverLeave}
                      >
                        {entry.met && <span aria-hidden="true">✓</span>}
                        {entry.name}{entry.optional && '（可选）'}
                      </span>
                    ))}
                  </div>
                )}

                {(item.matches.length > 0 || item.groups.length > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1" data-case-special-matches>
                    <span className="mr-0.5 text-ui-2xs text-ink-faint">
                      {item.groups.length ? '团体匹配' : '艺人匹配'}
                    </span>
                    {item.groups.length > 0
                      ? item.groups.slice(0, 2).map((group) => {
                        const complete = group.met === group.total
                          && group.certs.every((member) => member.met);
                        return (
                          <span
                            key={group.code}
                            data-case-special-group={group.code}
                            data-case-special-complete={complete}
                            className={cn(
                              'cursor-help inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-ui-2xs',
                              complete
                                ? 'border-growth-line bg-growth-soft font-semibold text-growth-strong'
                                : 'border-line bg-surface-soft text-ink',
                            )}
                            onMouseEnter={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              onGroupHover(group, {
                                left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                              });
                            }}
                            onMouseLeave={onHoverLeave}
                          >
                            {complete && <span aria-hidden="true">✓</span>}
                            {group.name} {group.met}/{group.total}
                          </span>
                        );
                      })
                      : item.matches.map((match) => {
                        const complete = match.met === match.total
                          && match.roleCerts.every((role) => role.met);
                        return (
                          <span
                            key={match.id}
                            data-case-special-match={match.id}
                            data-case-special-complete={complete}
                            className={cn(
                              'cursor-help inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-ui-2xs',
                              complete
                                ? 'border-growth-line bg-growth-soft font-semibold text-growth-strong'
                                : 'border-line bg-surface-soft text-ink',
                            )}
                            onMouseEnter={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              onMatchHover(match, SINGLE_ROLE_NOTICES.has(item.notice.id), {
                                left: rect.left,
                                right: rect.right,
                                top: rect.top,
                                bottom: rect.bottom,
                              });
                            }}
                            onMouseLeave={onHoverLeave}
                          >
                            {complete && <span aria-hidden="true">✓</span>}
                            {match.name} {match.met}/{match.total}
                          </span>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 九项属性名 -> 存档数值下标，跟 ATTRS 同序。 */
const ATTR_INDEX: Record<string, number> = Object.fromEntries(
  ATTRS.map((name, index) => [name, index]),
);

/** 一条数值门槛在当前艺人身上的对比结果；读不到当前值就是 null。 */
function thresholdGap(
  threshold: SelfMadeThreshold,
  artist: SelfMadeArtistView,
): { have: number | null; diff: number | null } {
  let have: number | null = null;
  if (threshold.kind === 'attr') {
    const index = ATTR_INDEX[threshold.label];
    have = index === undefined ? null : artist.abilities?.[index] ?? null;
  } else if (threshold.kind === 'friendship') {
    have = artist.friendship;
  } else if (threshold.kind === 'gifts') {
    have = artist.gifts;
  }
  return {
    have,
    diff: have === null ? null : Math.max(0, Math.ceil(threshold.value - have)),
  };
}

interface SelfMadeGroup {
  artist: SelfMadeArtistView;
  entries: { entry: SelfMadeEntry; owned: boolean }[];
  owned: number;
}

/** 自制通告清单：按「歌曲 / 剧本」分段，每段按旗下艺人分组，已拿到打勾。
 *  「其他」没有归属艺人，永远显示在最下面，不参与艺人过滤。 */
function SelfMadeSection({
  data,
  groups,
  onHover,
  onLeave,
  error,
}: {
  data: SelfMadeData | null;
  groups: { key: string; name: string; note: string; artists: SelfMadeGroup[] }[];
  onHover: (entry: SelfMadeEntry, artist: SelfMadeArtistView, owned: boolean, anchor: HoverAnchor) => void;
  onLeave: () => void;
  error: string | null;
}) {
  if (error) {
    return <p className="px-1 py-4 text-ui-2xs text-alert">自制表读取失败：{error}</p>;
  }
  if (!data) {
    return <p className="px-1 py-4 text-ui-2xs text-ink-faint">正在读取自制通告条件…</p>;
  }
  const sections = groups.filter((section) => section.artists.length > 0);
  if (sections.length === 0) {
    return <p className="px-1 py-4 text-ui-2xs text-ink-faint">当前存档的旗下艺人在自制表里没有对应作品。</p>;
  }

  return (
    <div className="space-y-2.5" data-case-selfmade-list>
      {sections.map((section) => (
        <div key={section.key} data-case-selfmade-section={section.key}>
          <p className="mb-1 flex flex-wrap items-baseline gap-x-1.5 text-ui-2xs font-bold text-brand-strong">
            {section.name}
            {section.note && <span className="font-normal text-ink-faint">{section.note}</span>}
          </p>
          <div className="space-y-1.5">
            {section.artists.map((group) => (
              <div key={group.artist.name} data-case-selfmade-artist={group.artist.name}>
                <p className="mb-0.5 flex items-baseline gap-1 text-ui-2xs">
                  <span className="font-semibold text-ink">{group.artist.name}</span>
                  <span className="tabular-nums text-ink-faint">{group.owned}/{group.entries.length}</span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {group.entries.map(({ entry, owned }) => (
                    <button
                      key={`${entry.name}-${entry.code ?? ''}`}
                      type="button"
                      data-case-selfmade={entry.code ?? entry.name}
                      data-case-selfmade-owned={owned ? 'true' : 'false'}
                      onMouseEnter={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        onHover(entry, group.artist, owned, {
                          left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                        });
                      }}
                      onMouseLeave={onLeave}
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
    </div>
  );
}

/** 自制通告浮层：条件原文 + 能算的数值对比，算不了的明确标「剧情条件」。 */
function SelfMadeHoverCard({
  entry,
  artist,
  owned,
  anchor,
  onEnter,
  onLeave,
}: {
  entry: SelfMadeEntry;
  artist: SelfMadeArtistView;
  owned: boolean;
  anchor: HoverAnchor;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <FloatingCard anchor={anchor} onEnter={onEnter} onLeave={onLeave} className="w-[300px] p-2.5 text-ui-2xs">
      <p className="mb-1 flex items-baseline gap-2 text-ui-xs font-semibold text-ink" data-case-selfmade-title>
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
      <p className="mb-1.5 flex items-baseline gap-1 text-ui-2xs text-ink-faint">
        <span>{artist.name}</span>
        <span>·</span>
        <span>{entry.section === 'script' ? '剧本' : '歌曲'}</span>
      </p>
      <div className="border-t border-line pt-1.5 text-ui-2xs leading-relaxed text-ink-muted" data-case-selfmade-condition>
        <span className="mr-1 font-semibold text-ink">条件</span>
        {entry.condition}
      </div>
      {entry.thresholds.length > 0 && (
        <div className="mt-1.5 border-t border-line pt-1.5" data-case-selfmade-thresholds>
          <p className="mb-1 text-ui-2xs font-semibold text-ink">
            数值门槛 <span className="font-normal text-ink-faint">· 当前 {artist.name}</span>
          </p>
          <div className="space-y-0.5">
            {entry.thresholds.map((threshold) => {
              const { have, diff } = thresholdGap(threshold, artist);
              return (
                <div
                  key={`${threshold.label}-${threshold.value}`}
                  data-case-selfmade-threshold={threshold.label}
                  className="flex items-baseline gap-1 text-ui-2xs"
                >
                  <span className="text-ink-muted">{threshold.label}</span>
                  <span className="tabular-nums text-ink-faint">需要 {threshold.value}</span>
                  {have === null ? (
                    <span className="ml-auto text-ink-faint">当前 —</span>
                  ) : diff === 0 ? (
                    <span className="ml-auto font-semibold text-growth-strong">
                      当前 {have} · 已达标
                    </span>
                  ) : (
                    <span className="ml-auto text-alert">
                      当前 {have} · 差 {diff}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {entry.note && (
        <p className="mt-1.5 border-t border-line pt-1.5 text-ui-2xs text-ink-faint">{entry.note}</p>
      )}
    </FloatingCard>
  );
}

export default function CaseSpecialsAssistant({ result, tables }: Props) {
  const { data, error } = useSpecialsData(true);
  const [view, setView] = useState<'specials' | 'selfmade'>('specials');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState('');
  const [hover, setHover] = useState<HoverState | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const showHover = (next: HoverState) => {
    clearHoverTimer();
    setHover(next);
  };
  /** 胶囊离开后留一点时间让鼠标挪进浮层；浮层自己接管后再真正关闭。 */
  const hideHoverSoon = () => {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => setHover(null), 180);
  };
  const hideHoverNow = () => {
    clearHoverTimer();
    setHover(null);
  };
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);


  const report = useMemo(
    () => (data && result ? evaluateLiveSpecials(data, result, tables) : null),
    [data, result, tables],
  );

  const selfMadeState = useSelfMadeData(open && view === 'selfmade');

  /** 自制通告只挂在当前签约艺人名下 + 「其他」，其他类别永远排最后。 */
  const selfMadeGroups = useMemo(() => {
    const source = selfMadeState.data;
    if (!source || !result) return [];
    const ownedCodes = new Set(result.selfMade.map((item) => item.code));
    const others: SelfMadeArtistView = { id: null, name: '其他', abilities: null, friendship: null, gifts: null };
    const signedByName = new Map<string, SelfMadeArtistView>();
    for (const option of result.artistDirectory) {
      if (!option.signed) continue;
      const stats = result.artists.find((artist) => artist.roleId === option.id);
      signedByName.set(option.name, {
        id: option.id,
        name: option.name,
        abilities: stats?.abilities ?? null,
        friendship: stats?.friendship ?? null,
        gifts: stats?.gifts ?? null,
      });
    }
    return source.sections.map((section) => {
      const byArtist = new Map<string, { entry: SelfMadeEntry; owned: boolean }[]>();
      for (const entry of source.entries) {
        if (entry.section !== section.key) continue;
        const artist = entry.artist === '其他' ? others : signedByName.get(entry.artist);
        if (!artist) continue;
        const list = byArtist.get(entry.artist) ?? [];
        list.push({ entry, owned: !!entry.code && ownedCodes.has(entry.code) });
        byArtist.set(entry.artist, list);
      }
      const artists: SelfMadeGroup[] = [];
      for (const [name, list] of byArtist) {
        const artist = name === '其他' ? others : signedByName.get(name);
        if (!artist) continue;
        artists.push({ artist, entries: list, owned: list.filter((item) => item.owned).length });
      }
      artists.sort((a, b) => (a.artist.id === null ? 1 : 0) - (b.artist.id === null ? 1 : 0));
      return { key: section.key, name: section.name, note: section.note, artists };
    });
  }, [selfMadeState.data, result]);

  const selfMadeOwned = selfMadeGroups.reduce((sum, section) => sum + section.artists.reduce(
    (inner, group) => inner + group.owned, 0), 0);
  const selfMadeTotal = selfMadeGroups.reduce((sum, section) => sum + section.artists.reduce(
    (inner, group) => inner + group.entries.length, 0), 0);

  useEffect(() => {
    // 默认全部收起；换存档后清掉指向旧通告的展开项。
    setExpanded((current) =>
      current && report?.notices.some((item) => item.notice.id === current) ? current : '');
  }, [report]);

  const badge = report ? `${report.doneCount}/6` : '';

  const hoverOverlay = open && hover ? (() => {
        if (hover.kind === 'match') {
          return (
            <MatchHoverCard
              key={`match-${hover.match.id}`}
              match={hover.match}
              hideSlotLabel={hover.hideSlotLabel}
              anchor={hover.anchor}
              onEnter={clearHoverTimer}
              onLeave={hideHoverNow}
            />
          );
        }
        if (hover.kind === 'group') {
          return (
            <GroupHoverCard
              key={`group-${hover.group.code}`}
              group={hover.group}
              anchor={hover.anchor}
              onEnter={clearHoverTimer}
              onLeave={hideHoverNow}
            />
          );
        }
        if (hover.kind === 'certGuide') {
          return (
            <CertGuideCard
              key={`guide-${hover.cert}`}
              cert={hover.cert}
              guide={hover.guide}
              anchor={hover.anchor}
              onEnter={clearHoverTimer}
              onLeave={hideHoverNow}
            />
          );
        }
        if (hover.kind === 'certPerson') {
          return (
            <CertPersonCard
              key={`person-${hover.cert}-${hover.person}`}
              guide={hover.guide}
              person={hover.person}
              anchor={hover.anchor}
              onEnter={clearHoverTimer}
              onLeave={hideHoverNow}
            />
          );
        }
        if (hover.kind === 'selfmade') {
          return (
            <SelfMadeHoverCard
              key={`selfmade-${hover.entry.code ?? hover.entry.name}-${hover.artist.name}`}
              entry={hover.entry}
              artist={hover.artist}
              owned={hover.owned}
              anchor={hover.anchor}
              onEnter={clearHoverTimer}
              onLeave={hideHoverNow}
            />
          );
        }
        return (
          <ItemHoverCard
            key={`item-${hover.item.name}`}
            item={hover.item}
            anchor={hover.anchor}
            onEnter={clearHoverTimer}
            onLeave={hideHoverNow}
          />
        );
  })() : null;

  const header = (
    <>
      <div
        data-case-assistant-view
        className="flex items-center gap-0.5 rounded-full border border-line bg-canvas p-0.5"
      >
        {([
          ['specials', '六大通告'],
          ['selfmade', '自制通告'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            data-case-assistant-tab={key}
            aria-pressed={view === key}
            onClick={() => { setView(key); hideHoverNow(); }}
            className={cn(
              'rounded-full px-2 py-0.5 text-ui-2xs transition-colors',
              view === key
                ? 'bg-brand-strong font-semibold text-canvas'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'specials' && report && (
        <span className="text-ui-2xs text-ink" data-case-assistant-progress>
          {report.doneCount}/6
        </span>
      )}
      {view === 'selfmade' && selfMadeTotal > 0 && (
        <span className="text-ui-2xs text-ink" data-case-selfmade-progress>
          {selfMadeOwned}/{selfMadeTotal}
        </span>
      )}
      <span className="ml-auto rounded-full border border-line px-1.5 py-0.5 text-ui-2xs text-ink-faint">
        基于当前存档
      </span>
    </>
  );

  return (
    <AssistantDock
      label="六大通告助手"
      badge={badge}
      open={open}
      onOpenChange={(next: boolean) => {
        setHover(null);
        setOpen(next);
      }}
      onClose={() => setHover(null)}
      onPanelScroll={hideHoverNow}
      onDragStart={hideHoverNow}
      header={header}
      overlay={hoverOverlay}
    >
              {!result && (
        <p className="pt-2 text-ui-2xs text-ink-faint">先载入一份存档，就能看到六大目标的实时完成程度。</p>
      )}
      {result && (view === 'specials' ? (
        <DetailSection
          report={report}
          expanded={expanded}
          onToggle={(id) => setExpanded((current) => (current === id ? '' : id))}
          onMatchHover={(match, hideSlotLabel, anchor) =>
            showHover({ kind: 'match', match, hideSlotLabel, anchor })}
          onGroupHover={(group, anchor) => showHover({ kind: 'group', group, anchor })}
          onCertGuideHover={(cert, guide, anchor) => showHover({ kind: 'certGuide', cert, guide, anchor })}
          onCertPersonHover={(cert, guide, person, anchor) =>
            showHover({ kind: 'certPerson', cert, guide, person, anchor })}
          onItemHover={(item, anchor) => showHover({ kind: 'item', item, anchor })}
          onHoverLeave={hideHoverSoon}
          dataError={error}
        />
      ) : (
        <SelfMadeSection
          data={selfMadeState.data}
          groups={selfMadeGroups}
          error={selfMadeState.error}
          onHover={(entry, artist, owned, anchor) =>
            showHover({ kind: 'selfmade', entry, artist, owned, anchor })}
          onLeave={hideHoverSoon}
        />
      ))}
    </AssistantDock>
  );
}
