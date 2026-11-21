/** 制作人好感：存档解析页的参考清单数据。
 *
 *  按唱片 / 电视剧 / 电影 / 广告 / 主持 / 其他六类分列，每类单独填制作人。
 *  友好度要等存档真源确认后再接；每位制作人给一个稳定 key 作为后续挂钩点。
 *  本轮先把六列空表搭好，内容等用户逐类提供。
 */

export type ProducerKind = 'record' | 'tv' | 'movie' | 'ad' | 'host' | 'other';

export interface Producer {
  /** 稳定锚点，后续用来对应存档里的友好度记录。 */
  key: string;
  name: string;
  /** 身份 / 所属。 */
  title?: string;
  /** 擅长类型。 */
  strengths: string[];
  /** 讨厌类型。 */
  dislikes?: string[];
  /** 出现条件；缺失表示未给出。 */
  condition?: string;
  /** 强度或选择提示。 */
  note?: string;
}

export interface ProducerGroup {
  kind: ProducerKind;
  label: string;
  producers: Producer[];
}

export const PRODUCER_GROUPS: ProducerGroup[] = [
  { kind: 'record', label: '唱片', producers: [] },
  { kind: 'tv', label: '电视剧', producers: [] },
  { kind: 'movie', label: '电影', producers: [] },
  { kind: 'ad', label: '广告', producers: [] },
  { kind: 'host', label: '主持', producers: [] },
  { kind: 'other', label: '其他', producers: [] },
];
