/** 「能力对照」新增的六张静态攻略表。它们不来自 notices.xls 管线，
 *  是攻略作者整理的参考知识，直接在这里维护；
 *  数值与文案按原表照录（含「陈菄菲」等原表写法）。 */

/** 适合出道的简单通告（无需名气）。conf = 是否吃自信（true=自信 / false=—）。 */
export interface DebutGroup {
  name: string;
  base: string;
  rows: { name: string; conf: boolean; others: string[] }[];
}

export const DEBUT_GROUPS: DebutGroup[] = [
  {
    name: '电视剧、电影配角',
    base: '演技',
    rows: [
      { name: '社会乡土剧', conf: true, others: ['口才'] },
      { name: '古装宫廷剧', conf: true, others: ['仪态'] },
      { name: '侦探悬疑剧', conf: true, others: ['才智'] },
      { name: '温馨伦理剧', conf: false, others: ['仪态', '体能'] },
      { name: '轻松幽默剧', conf: false, others: ['口才', '动感'] },
      { name: '少年励志剧', conf: false, others: ['口才', '才智'] },
      { name: '冒险动作剧', conf: false, others: ['动感', '体能'] },
      { name: '战争片（电影）', conf: false, others: ['体能', '才智'] },
    ],
  },
  {
    name: 'B类广告（两家广告公司轮流上档，每两周都有机会接一次）',
    base: '仪态',
    rows: [
      { name: '动感B类', conf: true, others: ['动感'] },
      { name: '演技B类', conf: true, others: ['演技'] },
      { name: '口才B类', conf: true, others: ['口才'] },
      { name: '才智B类', conf: true, others: ['才智'] },
    ],
  },
  {
    name: '唱片',
    base: '歌艺',
    rows: [
      { name: '舞曲', conf: true, others: ['动感', '体能'] },
      { name: '另类', conf: true, others: ['口才'] },
    ],
  },
  {
    name: '主持',
    base: '口才',
    rows: [
      { name: '知性谈话主持人', conf: true, others: ['仪态', '才智'] },
      { name: '采访报导', conf: true, others: ['体能'] },
      { name: '益智休闲', conf: true, others: ['仪态'] },
      { name: '知性谈话助理主持', conf: false, others: ['仪态', '才智'] },
      { name: '运动竞赛', conf: false, others: ['动感', '体能'] },
    ],
  },
];

/** 第一年个人/团体舞曲、另类通告数值要求。合并单元格按原表用 rowSpan 还原：
 *  带 span 的格在后续 span-1 行缺省（渲染时跳过），v 为区间或文字。 */
export interface AlbumCell {
  v: string;
  span?: number;
}
export interface AlbumRow {
  name: string;
  /** 团体专辑（原表红字）。 */
  group?: boolean;
  cat?: AlbumCell;
  diff?: AlbumCell;
  special?: AlbumCell;
  company?: AlbumCell;
  sing?: AlbumCell;
  mouth?: AlbumCell;
  /** 动感/体能两列在原表共享同一区间，合并成一格。 */
  move?: AlbumCell;
  conf?: AlbumCell;
}

export const ALBUM_ROWS: AlbumRow[] = [
  { name: '现在开始', cat: { v: '舞曲', span: 2 }, diff: { v: '1', span: 2 }, company: { v: 'EAMI', span: 2 }, sing: { v: '150-250' }, move: { v: '180-300', span: 2 }, conf: { v: '150-250' } },
  { name: '信与不信', group: true, mouth: { v: '120-200' }, conf: { v: '180-300' } },
  { name: '我就是浑，怎样?', cat: { v: '舞曲', span: 2 }, diff: { v: '2', span: 2 }, special: { v: '叛逆' }, company: { v: '日月光' }, sing: { v: '280-360', span: 2 }, move: { v: '320-400', span: 2 }, conf: { v: '280-360', span: 2 } },
  { name: 'Song for you', group: true, company: { v: 'EAMI' } },
  { name: '一千零一夜', cat: { v: '另类', span: 6 }, diff: { v: '3', span: 12 }, company: { v: '日月光', span: 9 }, sing: { v: '360-420', span: 6 }, mouth: { v: '270-330', span: 6 }, conf: { v: '420-480', span: 6 } },
  { name: '鸡心绝对' },
  { name: '流氓英雄', special: { v: '叛逆' } },
  { name: '顶港尚出名' },
  { name: '永恒的爱', group: true },
  { name: '说比唱好听', group: true },
  { name: '卖造', cat: { v: '舞曲', span: 6 }, move: { v: '420-480', span: 6 }, conf: { v: '360-420', span: 6 } },
  { name: '馒头夹蛋' },
  { name: '算了吧', group: true },
  { name: '世纪赌徒', company: { v: 'EAMI', span: 2 } },
  { name: '难耐的妩媚' },
  { name: '糗事一箩筐', group: true, company: { v: '京风' } },
  { name: '超级口水歌', cat: { v: '另类', span: 1 }, diff: { v: '4', span: 6 }, company: { v: '日月光', span: 2 }, mouth: { v: '400-450' }, conf: { v: '500-600' } },
  { name: '我的妈妈呀!', group: true, cat: { v: '舞曲', span: 5 } },
  { name: '冷酷的灵魂', company: { v: '京风', span: 4 }, sing: { v: '450-520', span: 5 }, move: { v: '500-600', span: 5 }, conf: { v: '450-520', span: 5 } },
  { name: '蛇蝎女子' },
  { name: '跳舞吧!' },
  { name: '抢抢滚' },
];

/** 特殊日程的数值影响：宣传类 / 旅游类。conf / fame = 自信↑ / 名气↑。 */
export interface ScheduleGroup {
  name: string;
  rows: { name: string; conf?: boolean; fame?: boolean; others: string[] }[];
}

export const SCHEDULE_GROUPS: ScheduleGroup[] = [
  {
    name: '宣传类',
    rows: [
      { name: '电视剧宣传', fame: true, others: ['口才'] },
      { name: '电影宣传', conf: true, others: ['仪态'] },
      { name: '拍摄MV', conf: true, fame: true, others: ['演技'] },
      { name: '唱片宣传', conf: true, fame: true, others: ['歌艺'] },
      { name: '签名会', conf: true, fame: true, others: ['仪态'] },
    ],
  },
  {
    name: '旅游类',
    rows: [
      { name: '日本逛街', conf: true, others: ['体能'] },
      { name: '美国探险', conf: true, others: ['动感', '体能'] },
      { name: '欧洲旅游', others: ['仪态', '才智', '体能'] },
      { name: '岛屿度假', others: ['动感', '体能'] },
      { name: '塞外观光', conf: true, others: ['才智', '体能'] },
      { name: '古国寻奇', others: ['才智', '体能'] },
    ],
  },
];

/** 通告数值负面影响：接这些类型会压低对应属性。 */
export const PENALTY_ROWS: { ability: string; types: string[] }[] = [
  { ability: '才智', types: ['爱情偶像剧', '爱情文艺片', '冒险动作剧', '冒险动作片'] },
  { ability: '动感', types: ['温馨伦理剧'] },
  { ability: '仪态', types: ['轻松幽默剧', '轻松喜剧片'] },
];

/** 通告放水情况一览（「放水」= 制作人放宽接演门槛）。 */
export const LENIENCY_ROWS: { who: string; note: string }[] = [
  { who: '周映彤、小熊', note: '无论好感均可放水' },
  { who: '陈查理（创意广告）', note: '好感度高可放水' },
  { who: '麦可（追梦广告）', note: '好感度高才可放水，且才能接S级广告' },
  { who: '王瑞恩、陈菄菲（SOSA戏剧）', note: '好感高才能接主角，且只给配角放水' },
  { who: '强尼戴（SOSA主持）', note: '好感高 + 艺人人气高，可放水' },
  { who: '郑超一（永振戏剧）', note: '好感高才能接主角、放水' },
  { who: '钱钧（永振主持）', note: '不放水' },
];

/** 颁奖典礼日程：dates = [第一年, 第二年, 第三年] 的「入围|颁奖」日期。 */
export const AWARD_ROWS: { name: string; month: string; dates: string[] }[] = [
  { name: '金星奖', month: '2月', dates: ['6|24', '5|23', '4|29'] },
  { name: '金钟奖', month: '5月', dates: ['1|26', '7|25', '5|30'] },
  { name: '金曲奖', month: '8月', dates: ['7|25', '6|31', '4|29'] },
  { name: '金像奖', month: '11月', dates: ['6|24', '5|31', '3|28'] },
];
