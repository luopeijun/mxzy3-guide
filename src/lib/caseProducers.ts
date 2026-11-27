/** 制作人好感：存档解析页的参考清单数据。
 *
 *  按唱片 / 电视剧 / 电影 / 广告 / 主持 / 其他六类分列，每类单独填制作人。
 *  `code` 是存档里的角色编号，也是查友好度的锚点：存档制作人友好度表每条
 *  284 字节，`+0` 角色编号、`+148` 友好度。友好度从当前存档动态读取，
 *  这里只放编号与静态说明。
 */

export type ProducerKind = 'record' | 'tv' | 'movie' | 'ad' | 'host' | 'other';

export interface Producer {
  /** 稳定锚点，后续用来对应存档里的友好度记录。 */
  key: string;
  /** 存档里的角色编号，查友好度用（401 周映彤 / 501 小熊 / 601 陈查理 / 701 麦克…）。 */
  code: number;
  name: string;
  /** 身份 / 所属。 */
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

export const PRODUCER_GROUPS: ProducerGroup[] = [
  {
    kind: 'record',
    label: '唱片',
    producers: [
      { key: 'zhou-yingtong', code: 401, name: '周映彤', title: 'EAMI唱片公司负责人' },
      { key: 'xiao-xiong', code: 501, name: '小熊', title: '日月光音乐负责人' },
      { key: 'jia-he-da-ze', code: 1301, name: '加贺大泽' },
    ],
  },
  {
    kind: 'tv',
    label: '电视剧',
    producers: [
      { key: 'chen-ge-fei', code: 301, name: '陈革非' },
      { key: 'zheng-chao-yi', code: 201, name: '郑超一' },
    ],
  },
  {
    kind: 'movie',
    label: '电影',
    producers: [
      { key: 'wang-rui-en', code: 101, name: '王瑞恩' },
      { key: 'shi-mai-ke', code: 1302, name: '史麦克' },
    ],
  },
  {
    kind: 'ad',
    label: '广告',
    producers: [
      { key: 'chen-chali', code: 601, name: '陈查理' },
      { key: 'mai-ke', code: 701, name: '麦克' },
    ],
  },
  {
    kind: 'host',
    label: '主持',
    producers: [
      { key: 'qiang-ni-dai', code: 302, name: '强尼戴' },
      { key: 'qian-jun', code: 202, name: '钱钧' },
    ],
  },
  {
    kind: 'other',
    label: '其他',
    producers: [
      { key: 'he-zong', code: 3, name: '贺总' },
      { key: 'steven', code: 38, name: '史蒂芬' },
      { key: 'dennis', code: 39, name: '丹尼斯' },
    ],
  },
];
