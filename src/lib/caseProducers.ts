/** 制作人好感：存档解析页的参考清单数据。
 *
 *  分组不再写死在代码里，而是按存档 284B 角色记录 `+181` 的 ASCII 项目代号
 *  动态生成。`code` 仍是查友好度的锚点：`+0` 角色编号、`+148` 友好度，
 *  友好度与名字都从当前存档动态读取，这里只放代号白名单和兜底信息。
 */

export type ProducerKind = 'record' | 'tv' | 'movie' | 'ad' | 'host' | 'other';

export interface Producer {
  /** 稳定锚点，后续用来对应存档里的友好度记录。 */
  key: string;
  /** 存档里的角色编号，查友好度用（401 周映彤 / 501 小熊 / 601 陈查理 / 701 麦克…）。 */
  code: number;
  name: string;
  /** 身份 / 所属，仅存档没有项目代号时兜底。 */
  title?: string;
}

export interface ProducerGroup {
  kind: ProducerKind;
  label: string;
  producers: Producer[];
}

/** 存档 284 字节角色记录 `+181` 的 ASCII 项目代号 -> 游戏内身份。
 *  只收录能跟攻略文本 / 现有静态表对上的代号；没对上的保留存档代号原文，
 *  不硬编中文（例如 Role_* 占位本来就不放进解析结果）。 */
export const PRODUCER_PROJECT_LABELS: Record<string, string> = {
  Movie_Wang: '全球制片',
  LCTV_Drama: '永振电视台·电视剧',
  LCTV_Show: '永振电视台·主持',
  SoSaTV_Drama: 'Sosa电视台·电视剧',
  SoSaTV_Show: 'Sosa电视台·主持',
  EAMI_CD: 'EAMI唱片',
  SML_CD: '日月光音乐',
  I_AM_I_AD: '创意广告',
  DreamAD: '追梦广告',
  Tokyo_CD: '东京唱片',
  LAMovie: '好莱坞电影',
};

/** 项目代号转中文身份；表里没收录的代号原样显示，仍以存档为真源。 */
export function producerProjectLabel(project: string | undefined): string {
  if (!project) return '';
  return PRODUCER_PROJECT_LABELS[project] ?? project;
}

interface ProducerSeed {
  kind: ProducerKind;
  key: string;
  name: string;
  /** 存档缺项目代号时的兜底角色编号。 */
  code: number;
}

/** 项目代号白名单：存档 `+181` 代号 -> 分组 + 稳定 key。
 *  角色编号只作兜底，正常情况下从存档里按代号反查，避免编号漂移。 */
const PROJECT_SEEDS: Array<ProducerSeed & { project: string }> = [
  { project: 'EAMI_CD', kind: 'record', key: 'zhou-yingtong', name: '周映彤', code: 401 },
  { project: 'SML_CD', kind: 'record', key: 'xiao-xiong', name: '小熊', code: 501 },
  { project: 'Tokyo_CD', kind: 'record', key: 'jia-he-da-ze', name: '加贺大泽', code: 1301 },
  { project: 'Movie_Wang', kind: 'movie', key: 'wang-rui-en', name: '王瑞恩', code: 101 },
  { project: 'LAMovie', kind: 'movie', key: 'shi-mai-ke', name: '史麦克', code: 1302 },
  { project: 'LCTV_Drama', kind: 'tv', key: 'zheng-chao-yi', name: '郑超一', code: 201 },
  { project: 'SoSaTV_Drama', kind: 'tv', key: 'chen-ge-fei', name: '陈革非', code: 301 },
  { project: 'LCTV_Show', kind: 'host', key: 'qian-jun', name: '钱钧', code: 202 },
  { project: 'SoSaTV_Show', kind: 'host', key: 'qiang-ni-dai', name: '强尼戴', code: 302 },
  { project: 'I_AM_I_AD', kind: 'ad', key: 'chen-chali', name: '陈查理', code: 601 },
  { project: 'DreamAD', kind: 'ad', key: 'mai-ke', name: '麦克', code: 701 },
];

/** 存档里没有项目代号、但仍属于制作人序列的角色，按编号白名单收进「其他」。 */
const CODE_ONLY_SEEDS: ProducerSeed[] = [
  { kind: 'other', key: 'he-zong', name: '贺总', code: 3 },
  { kind: 'other', key: 'steven', name: '史蒂芬', code: 38 },
  { kind: 'other', key: 'dennis', name: '丹尼斯', code: 39 },
];

const GROUP_LAYOUT: Array<{ kind: ProducerKind; label: string }> = [
  { kind: 'record', label: '唱片' },
  { kind: 'tv', label: '电视剧' },
  { kind: 'movie', label: '电影' },
  { kind: 'ad', label: '广告' },
  { kind: 'host', label: '主持' },
  { kind: 'other', label: '其他' },
];

/** 按存档项目代号生成六列分组；名字仍以存档 Big5 为真源，缺档时用白名单中文兜底。 */
export function buildProducerGroups(
  projects: Record<number, string>,
  names: Record<number, string>,
): ProducerGroup[] {
  const buckets = Object.fromEntries(
    GROUP_LAYOUT.map(({ kind }) => [kind, [] as Producer[]]),
  ) as Record<ProducerKind, Producer[]>;
  const usedCodes = new Set<number>();

  const add = (seed: ProducerSeed, resolvedCode?: number) => {
    const code = resolvedCode ?? seed.code;
    if (usedCodes.has(code)) return;
    usedCodes.add(code);
    buckets[seed.kind].push({
      key: seed.key,
      code,
      name: names[code] || seed.name,
    });
  };

  const codeByProject = new Map<string, number>();
  for (const [codeText, project] of Object.entries(projects)) {
    const code = Number(codeText);
    if (Number.isFinite(code) && !codeByProject.has(project)) codeByProject.set(project, code);
  }

  for (const seed of PROJECT_SEEDS) add(seed, codeByProject.get(seed.project));
  for (const seed of CODE_ONLY_SEEDS) add(seed);

  return GROUP_LAYOUT.map(({ kind, label }) => ({ kind, label, producers: buckets[kind] }));
}
