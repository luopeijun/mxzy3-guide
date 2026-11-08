import { Fragment } from 'react';
import type { ContentBlock } from '../types/guide';
import { groupBlocks } from '../lib/guide';
import type { IndexedBlock } from '../lib/guide';
import DataTable from './DataTable';
import HighlightText from './HighlightText';
import OptionLine from './OptionLine';
import QuestionCard from './QuestionCard';
import TypeTag from './TypeTag';

interface Props {
  blocks: ContentBlock[];
  onJump?: (anchor: string) => void;
  /** 子事件（如 3-1 / 3-1-1）按其编号层级嵌套到父事件之下，呈现父子关系。作用于「其他事件」全部章节（角色攻略暂不启用）。 */
  nestSubEvents?: boolean;
}

type EventGroup = { group: number; blocks: IndexedBlock[] };

/** 层级 = 编号里 `－`/`-` 的个数：3 → 0，3-1 → 1，3-1-1 → 2。 */
function eventDepth(label?: string): number {
  if (!label) return 0;
  return label.match(/[-－]/g)?.length ?? 0;
}

interface EventNode {
  group: EventGroup;
  children: EventNode[];
  depth: number;
}

/** 按事件编号层级把连续的事件分组组织成树：父事件下挂编号更深一层的子事件，同级兄弟共享同一父。
 *  用栈顶节点 depth 与当前 depth 比较来定父节点，能正确处理同级兄弟（如 14-1-1 / 14-1-2）与跨层跳转。 */
function buildEventTree(groups: EventGroup[]): { roots: EventNode[]; byGroup: Map<number, EventNode> } {
  const roots: EventNode[] = [];
  const byGroup = new Map<number, EventNode>();
  const stack: EventNode[] = [];
  for (const g of groups) {
    const depth = eventDepth(g.blocks[0]?.label);
    const node: EventNode = { group: g, children: [], depth };
    byGroup.set(g.group, node);
    // 弹出所有层级 >= 当前层级的节点（同级兄弟及其子孙），父节点落在 depth-1。
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return { roots, byGroup };
}

/** 事件卡外壳：CG 事件用玫红描边 + 浅粉底，普通事件用浅灰描边 + 白底。 */
function eventCardClasses(cg: boolean): string {
  return `rounded-ui-sm border px-3 py-2.5 ${cg ? 'border-brand bg-brand-soft' : 'border-line bg-surface'}`;
}

/** 事件卡首行：编号 pill + 类型 tag + CG 徽标 + 正文。 */
function EventHead({ head }: { head: IndexedBlock }) {
  const cg = head.cg;
  return (
    <div className="flex items-start gap-2.5 text-ui-sm leading-[1.85]">
      {head.label && (
        <span className={`mt-[3px] min-w-[30px] shrink-0 rounded-ui-xs px-[5px] text-center text-ui-2xs font-bold leading-[1.7] ${cg ? 'bg-brand text-white' : 'bg-brand-soft text-brand-strong'}`}>
          {head.label}
        </span>
      )}
      <span className="min-w-0 flex-1 break-words">
        {head.tag && <TypeTag label={head.tag} />}
        {cg && (
          <span className="mr-1.5 inline-flex items-center rounded-ui-xs border border-gold-line bg-gold-soft px-[5px] py-[1px] text-ui-2xs font-bold leading-[1.6] text-gold align-middle">CG</span>
        )}
        <HighlightText text={head.text} />
      </span>
    </div>
  );
}

/** 平铺（非嵌套）模式下的一张事件卡：自身内容 + 自己的选项/提醒。 */
function EventCard({ blocks }: { blocks: IndexedBlock[] }) {
  const [head, ...rest] = blocks;
  return (
    <div className={`mb-3 ${eventCardClasses(!!head.cg)}`}>
      <EventHead head={head} />
      {rest.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5 pl-[40px]">
          {rest.map((block) => <EventDetail key={block.index} block={block} />)}
        </div>
      )}
    </div>
  );
}

/** 嵌套模式下的一张事件卡：自身内容 + 自己的选项/提醒 + 递归挂在它之下的子事件。 */
function EventNode({ node }: { node: EventNode }) {
  const [head, ...rest] = node.group.blocks;
  return (
    <div className={eventCardClasses(!!head.cg)}>
      <EventHead head={head} />
      {rest.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5 pl-[40px]">
          {rest.map((block) => <EventDetail key={block.index} block={block} />)}
        </div>
      )}
      {node.children.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2.5 border-l-2 border-brand-line pl-3">
          {node.children.map((child) => <EventNode key={child.group.group} node={child} />)}
        </div>
      )}
    </div>
  );
}

function EventDetail({ block }: { block: IndexedBlock }) {
  if (block.kind === 'note') {
    return (
      <p className="whitespace-pre-line rounded-r-ui-sm border-l-[3px] border-gold bg-note-soft px-2.5 py-1.5 text-ui-2xs leading-[1.8] text-note">
        <HighlightText text={block.text} tone="note" />
      </p>
    );
  }
  if (block.kind === 'option') {
    return <OptionLine text={block.text} className="ml-[10px]" />;
  }
  return (
    <p className="text-ui-sm leading-[1.8] break-words text-ink">
      <HighlightText text={block.text} />
    </p>
  );
}

/** One catalogue entry: its name, a few labelled lines and optional notes. */
function ItemCard({ block }: { block: IndexedBlock }) {
  return (
    <div className="mb-2.5 rounded-ui-sm border border-line bg-surface px-3 py-2.5">
      <p className="text-ui-sm font-bold leading-[1.7] break-words text-ink">{block.text}</p>
      {(block.rows?.length ?? 0) > 0 && (
        <div className="mt-1.5 flex flex-col gap-[3px]">
          {block.rows!.map((row, position) => (
            <p key={position} className="flex items-start gap-2 text-ui-sm leading-[1.75]">
              <span
                className={
                  row.label.startsWith('＋')
                    ? 'mt-px w-[54px] shrink-0 text-ui-2xs font-bold leading-[2] text-brand-strong'
                    : 'mt-px w-[54px] shrink-0 text-ui-2xs leading-[2] text-ink-faint'
                }
              >
                {row.label}
              </span>
              <span className="min-w-0 flex-1 break-words text-ink">{row.value}</span>
            </p>
          ))}
        </div>
      )}
      {block.notes?.map((note, position) => (
        <p
          key={`note-${position}`}
          className="mt-1.5 rounded-r-ui-sm border-l-[3px] border-gold bg-note-soft px-2.5 py-1.5 text-ui-2xs leading-[1.8] text-note"
        >
          {note}
        </p>
      ))}
    </div>
  );
}

function BlockView({ block, bigHeadings = false }: { block: IndexedBlock; bigHeadings?: boolean }) {
  switch (block.kind) {
    case 'section':
      return (
        <h3
          id={block.id ?? `block-${block.index}`}
          className="mt-7 mb-3 scroll-mt-[18px] text-ui-lg font-bold tracking-[0.01em] text-brand-strong"
        >
          {block.text}
        </h3>
      );
    case 'heading':
      if (bigHeadings) {
        // 平铺页面（无 section）的所有标题默认按大标题渲染，避免整页都是次级标题。
        return (
          <h3
            id={block.id ?? `block-${block.index}`}
            className="mt-7 mb-3 scroll-mt-[18px] text-ui-lg font-bold tracking-[0.01em] text-brand-strong"
          >
            {block.text}
          </h3>
        );
      }
      return (
        <h3
          id={block.id ?? `block-${block.index}`}
          className="mt-5 mb-2 flex scroll-mt-[18px] items-center gap-2 text-ui-md font-bold text-brand-strong"
        >
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rotate-45 bg-brand" />
          {block.text}
        </h3>
      );
    case 'event':
      return (
        <div className="mb-1 flex items-start gap-2.5 text-ui-sm leading-[1.8]">
          {block.label && (
            <span className="mt-[3px] min-w-[30px] shrink-0 rounded-ui-xs bg-brand-soft px-[5px] text-center text-ui-2xs font-bold leading-[1.7] text-brand-strong">
              {block.label}
            </span>
          )}
          <span className="min-w-0 flex-1 break-words">
            {block.tag && <TypeTag label={block.tag} />}
            <HighlightText text={block.text} />
          </span>
        </div>
      );
    case 'option':
      return <OptionLine text={block.text} className="mb-[3px] ml-10 phone:ml-[22px]" />;
    case 'note':
      return (
        <p className="mb-[5px] whitespace-pre-line rounded-r-ui-sm border-l-[3px] border-gold bg-note-soft px-3 py-2 text-ui-sm leading-[1.8] text-note">
          <HighlightText text={block.text} tone="note" />
        </p>
      );
    case 'qa':
      // Every Q&A pair is its own item: a dot in the gutter for the question,
      // and the answer nested under it, so a long run of questions stays scannable.
      return (
        <div className="mb-3.5">
          <p className="relative pl-[19px] text-ui-sm leading-[1.75] break-words text-ink">
            <span
              aria-hidden="true"
              className="absolute left-[6px] top-[11px] h-[5px] w-[5px] rounded-full bg-brand"
            />
            <HighlightText text={block.text} />
          </p>
          {block.answer && (
            <p className="mt-1 flex items-start gap-1.5 pl-[19px]">
              <span className="mt-[3px] shrink-0 rounded-ui-xs bg-brand-soft px-[5px] text-ui-2xs font-bold leading-[1.6] text-brand-strong">
                答
              </span>
              <span className="min-w-0 flex-1 text-ui-sm leading-[1.75] break-words text-ink">
                <HighlightText text={block.answer} />
              </span>
            </p>
          )}
        </div>
      );
    case 'table':
      return block.table ? <DataTable data={block.table} /> : null;
    case 'item':
      return <ItemCard block={block} />;
    default: {
      // A list item carries a round dot in the gutter and a hanging indent, so
      // a run of names/types reads as separate entries instead of one text wall.
      if (block.bullet) {
        return (
          <p className="relative mb-1 mt-2 pl-[19px] text-ui-md leading-[1.9] break-words text-ink">
            <span
              aria-hidden="true"
              className="absolute left-[6px] top-[12px] h-[5px] w-[5px] rounded-full bg-brand"
            />
            <HighlightText text={block.text} />
          </p>
        );
      }
      // Nested lines (e.g. the a/b/c alternatives under a numbered condition)
      // step in once per level and fade a notch so the hierarchy reads at a glance.
      if (block.depth === 2) {
        return (
          <p className="mb-1 ml-[42px] text-ui-sm leading-[1.85] break-words text-ink-muted">
            <HighlightText text={block.text} />
          </p>
        );
      }
      if (block.depth === 1) {
        return (
          <p className="mb-1 ml-[19px] text-ui-md leading-[1.9] break-words text-ink">
            <HighlightText text={block.text} />
          </p>
        );
      }
      return (
        <p className="mb-1 text-ui-md leading-[1.9] break-words text-ink">
          <HighlightText text={block.text} />
        </p>
      );
    }
  }
}

export default function ContentBlockList({ blocks, onJump, nestSubEvents }: Props) {
  const groups = groupBlocks(blocks);
  if (!groups.length) return null;

  // 一个页面若没有任何大标题(section)，其 heading 默认按大标题渲染，
  // 避免整页都是次级标题。只有当页面确实存在 section + 子标题层级时，
  // heading 才作为次级标题。
  const flat = !blocks.some((b) => b.kind === 'section');

  // 嵌套模式（其他事件全部章节启用，角色攻略暂不启用）：把事件分组按编号层级
  // 组织成树，子事件挂在父事件之下；同级兄弟共享同一父。
  const eventGroups = groups.filter((g) => g.blocks[0]?.kind === 'event');
  const { roots, byGroup } = buildEventTree(eventGroups);
  const rootIds = new Set(roots.map((r) => r.group.group));

  return (
    <article>
      {groups.map((group, index) => {
        const [first, ...rest] = group.blocks;
        const options = rest.filter((block) => block.kind === 'option');

        // 嵌套模式下：子事件由父事件递归渲染，这里跳过；根事件渲染整棵子树。
        if (first.kind === 'event' && nestSubEvents) {
          if (!rootIds.has(group.group)) return null;
          const node = byGroup.get(group.group)!;
          return (
            <div key={group.group} className="mb-3">
              <EventNode node={node} />
            </div>
          );
        }

        // A labelled heading with options is a question card (see QuestionCard).
        if (onJump && first.kind === 'heading' && first.id && options.length) {
          return (
            <QuestionCard key={group.group} heading={first} options={options} onJump={onJump} />
          );
        }
        // Numbered events keep their options and reminders inside one card.
        if (first.kind === 'event') {
          return <EventCard key={group.group} blocks={group.blocks} />;
        }
        // Catalogue entries are one card each, with no section wrapper around them.
        if (first.kind === 'item') {
          return (
            <Fragment key={group.group}>
              {group.blocks.map((block) => <ItemCard key={block.index} block={block} />)}
            </Fragment>
          );
        }
        // A long hairline above every major section (except the first) marks the
        // boundary between chapters — the section title alone read too weakly.
        // 平铺页面里的大标题(heading)同样加分隔线。
        const sectionRule = (first.kind === 'section' || (flat && first.kind === 'heading')) && index > 0 && (
          <div className="mb-6 mt-7 border-t border-brand-line" />
        );
        return (
          <Fragment key={group.group}>
            {sectionRule}
            <section className="mb-4">
              {group.blocks.map((block) => <BlockView key={block.index} block={block} bigHeadings={flat} />)}
            </section>
          </Fragment>
        );
      })}
    </article>
  );
}
