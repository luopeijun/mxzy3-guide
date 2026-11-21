/** 制作人好感：存档解析页的静态参考清单。
 *
 *  按唱片 / 电视剧 / 电影三类列出全部制作人，标注擅长类型、讨厌类型、出现条件
 *  与选择提示。友好度要等存档真源确认后再接；这里给每位制作人一个稳定的拼音
 *  key，作为后续把存档友好度挂上来的锚点，本轮只负责把清单列全。
 */

export type ProducerKind = 'record' | 'tv' | 'movie';

export interface Producer {
  /** 稳定锚点，后续用来对应存档里的友好度记录。 */
  key: string;
  name: string;
  /** 身份 / 所属，如「日月光音乐负责人」。 */
  title?: string;
  /** 擅长类型；唱片是曲风，电视剧 / 电影是剧种。 */
  strengths: string[];
  /** 讨厌类型，目前只有小熊有。 */
  dislikes?: string[];
  /** 出现条件；缺失表示攻略未给出解锁条件。 */
  condition?: string;
  /** 强度或选择提示，如「最强」「作品量大，但有好有坏，依剧情慎选」。 */
  note?: string;
}

export interface ProducerGroup {
  kind: ProducerKind;
  label: string;
  producers: Producer[];
}

export const PRODUCER_GROUPS: ProducerGroup[] = [
  {
    kind: 'record',
    label: '唱片制作人',
    producers: [
      { key: 'lin-yongyu', name: '林永育', strengths: ['爵士'], condition: '游戏一开始即拥有' },
      { key: 'ji-qingping', name: '季青平', strengths: ['另类'], condition: '游戏一开始即拥有' },
      { key: 'jin-ni', name: '金妮', strengths: ['抒情'], condition: '游戏一开始即拥有' },
      {
        key: 'xiao-xiong',
        name: '小熊',
        title: '日月光音乐负责人',
        strengths: ['摇滚'],
        dislikes: ['民歌'],
        condition: '小熊的友好度＞200',
      },
      {
        key: 'chi-hao',
        name: '迟浩',
        strengths: ['舞曲', '节奏蓝调'],
        condition: '小熊的友好度＞200',
      },
      {
        key: 'zhou-yingtong',
        name: '周映彤',
        title: 'EAMI唱片公司负责人',
        strengths: ['抒情'],
        condition: '周映彤的友好度＞200',
      },
      {
        key: 'lin-mingyang',
        name: '林明扬',
        strengths: ['民歌'],
        condition: '周映彤的友好度＞200',
      },
      {
        key: 'qian-yongfu',
        name: '钱永富',
        strengths: ['抒情', '儿歌'],
        condition: '周映彤的友好度＞200',
      },
    ],
  },
  {
    kind: 'tv',
    label: '电视剧制作人',
    producers: [
      { key: 'cai-xiaoyun', name: '蔡筱韵', strengths: ['温馨伦理剧'] },
      { key: 'chen-shumin', name: '陈淑敏', strengths: ['爱情偶像剧'], note: '最强' },
      { key: 'li-meijing', name: '李美静', strengths: ['爱情偶像剧'], note: '第二强' },
      { key: 'wei-guanlin', name: '魏冠霖', strengths: ['冒险动作剧'] },
      { key: 'cai-kunlong', name: '蔡昆隆', strengths: ['轻松幽默剧'] },
      { key: 'long-shaowu', name: '龙少武', strengths: ['社会乡土剧'] },
      { key: 'hong-ying', name: '红英', strengths: ['侦探悬疑剧'] },
      { key: 'wei-guoqiang', name: '卫国强', strengths: ['古装宫廷剧'] },
      { key: 'bai-junyu', name: '白军羽', strengths: ['少年励志剧'] },
    ],
  },
  {
    kind: 'movie',
    label: '电影导演',
    producers: [
      { key: 'wang-ruien', name: '王瑞恩', strengths: ['爱情文艺'], note: '最强' },
      {
        key: 'sun-lingxiang',
        name: '孙凌香',
        strengths: ['爱情文艺'],
        note: '作品量大，但有好有坏，依剧情慎选',
      },
      { key: 'li-enguang', name: '李恩光', strengths: ['动作冒险'] },
      { key: 'fan-xiaoyang', name: '范晓阳', strengths: ['侦探悬疑'] },
      { key: 'zhang-zixuan', name: '张子轩', strengths: ['科幻未来片'] },
      { key: 'wang-jin', name: '王金', strengths: ['剧情片'] },
    ],
  },
];

/** 制作人总数，供本页小结显示。 */
export const PRODUCER_COUNT = PRODUCER_GROUPS.reduce(
  (total, group) => total + group.producers.length,
  0,
);
