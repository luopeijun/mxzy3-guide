// 静态小贴士内容：转录自玩家整理的几张速查表（培养 / 比赛 / 关键事件）。
// 颜色编码沿用原表语义：音乐证书=绿、戏剧证书=金、舞蹈证书=红。

/** 证书类型的配色：和原表按证书类型区分的底色一致。 */
export const CERT_TONE: Record<string, string> = {
  音乐证书: 'bg-growth-soft text-growth-strong',
  戏剧证书: 'bg-gold-soft text-gold',
  舞蹈证书: 'bg-alert-soft text-alert',
};

export interface TrainingRow {
  name: string;
  a: string;
  b: string;
  cert: string;
  grade: string;
}
export const TRAINING_ROWS: TrainingRow[] = [
  { name: '音感发声', a: '歌艺', b: '自信', cert: '音乐证书', grade: '专业' },
  { name: '乐器乐理', a: '歌艺', b: '才智', cert: '音乐证书', grade: '专业' },
  { name: '声音表情', a: '演技', b: '口才', cert: '戏剧证书', grade: '专业' },
  { name: '肢体动作', a: '演技', b: '动感', cert: '戏剧证书', grade: '专业' },
  { name: '说话技巧', a: '口才', b: '自信', cert: '戏剧证书', grade: '高级' },
  { name: '摄影训练', a: '仪态', b: '体能', cert: '舞蹈证书', grade: '高级' },
  { name: '舞台表演', a: '仪态', b: '动感', cert: '舞蹈证书', grade: '专业' },
  { name: '有氧舞蹈', a: '动感', b: '体能', cert: '舞蹈证书', grade: '专业' },
  { name: '快速记忆', a: '口才', b: '才智', cert: '音乐证书', grade: '高级' },
  { name: '美姿美仪', a: '仪态', b: '自信', cert: '音乐证书', grade: '高级' },
];

export interface PartTimeRow {
  name: string;
  attrs: string[];
  /** 被压低的属性，单独以红色标出，如「动感」。 */
  drop?: string;
  /** 名气列，可能带「(仅资深)」；空缺表示该打工不产出名气。 */
  fame?: string;
}
export const PARTTIME_ROWS: PartTimeRow[] = [
  { name: '唱片制作', attrs: ['歌艺', '才智'], drop: '动感', fame: '' },
  { name: '戏剧配音', attrs: ['演技', '自信'], fame: '名气' },
  { name: '幕后合音', attrs: ['歌艺', '仪态'], fame: '名气(仅资深)' },
  { name: 'MV演出', attrs: ['演技', '自信'], fame: '名气' },
  { name: '秀场主持', attrs: ['口才', '才智(仅资深)'], fame: '名气' },
  { name: '节目助理', attrs: ['口才', '自信', '体能'], fame: '名气' },
  { name: '舞群伴舞', attrs: ['动感', '体能'], fame: '名气' },
  { name: '平面模特', attrs: ['仪态', '自信'], fame: '名气' },
];

export interface CertRow {
  name: string;
  need: string;
  course: string;
}
export const CERT_ROWS: CertRow[] = [
  { name: '戏剧证书', need: '演技700，口才600，自信500', course: '纽约课程3次' },
  { name: '音乐证书', need: '歌艺700，才智600，自信500', course: '维也纳课程3次' },
  { name: '舞蹈证书', need: '仪态650，动感650，体能550', course: '夏威夷课程3次' },
];

export interface SingerRow {
  point: string;
  note: string;
}
export const SINGER_ROWS: SingerRow[] = [
  { point: '主练歌艺和自信', note: '自信影响压力增长率' },
  { point: '另类要练口才', note: '体能影响疲劳增长率' },
  { point: '除舞曲和另类以外，其他都要名气', note: '动感影响完美率' },
  { point: '抒情、爵士和民歌需要练仪态', note: '' },
  { point: '摇滚和舞曲需要练动感、体能', note: '' },
  { point: '节奏蓝调、民歌、儿歌需要才智', note: '' },
];

export interface ProducerGroup {
  name: string;
  sub?: string;
  lines: string[];
  unlock?: string;
}
export const PRODUCER_GROUPS: ProducerGroup[] = [
  {
    name: '唱片公司制作人擅长方向',
    lines: [
      '爵士：林永宵；儿歌：钱永富；节奏蓝调、舞曲：迟浩',
      '抒情：金妮、周映彤、钱永富；摇滚：小熊（讨厌民歌）',
      '民歌：林明扬；另类：季青平',
    ],
    unlock: '周映彤友好度>200解锁；小熊友好度>200解锁',
  },
  {
    name: '电视剧制作人擅长方向',
    sub: 'SOSA、永振制作人高好感解锁',
    lines: [
      '温馨伦理剧：蔡筱韵；爱情偶像剧：陈淑敏（最强），李美静',
      '冒险动作剧：魏冠霖；轻松幽默剧：蔡昆隆',
      '社会乡土剧：龙少武；古装宫廷剧：卫国强（见批注）',
    ],
  },
];

export const PROP_ROWS: { name: string; items: string }[] = [
  { name: '鱼缸', items: '10万风水、30万造景、80万造景热带、420万海景' },
  { name: '公关', items: '12万招财猫、50万聚宝盆、80万蟾蜍、180万风水球' },
];
export const PR_NOTE = '公关提升可增加所有制作人好感度，便于自制通告及放水↓';

export interface BeautyRow {
  attr: string;
  years: string[];
  note: string;
}
export const BEAUTY_ROWS: BeautyRow[] = [
  { attr: '仪态', years: ['200|200', '400|500', '600|800'], note: '初选|决选' },
  { attr: '动感', years: ['200|200', '300|400', '400|600'], note: '初选|决选' },
  { attr: '自信', years: ['200|200', '400|500', '600|800'], note: '初选|决选' },
  { attr: '演技', years: ['200', '400', '600'], note: '决选' },
  { attr: '体能', years: ['200', '400', '600'], note: '决选' },
  { attr: '名气', years: ['450', '700', '900'], note: '写真集' },
];
export const BEAUTY_NOTE = '每年4月举办，要求名模及以上（见批注）';

export const EASYSHOP = {
  limit: '该事件为光碟版限定，steam版无',
  lines: [
    '初选：摄影训练、美姿美仪高级（7月）',
    '决选：摄影训练、美姿美仪专业（8月）',
    '仪态、体能、自信大于300，属性最高者当选（8月20日）',
  ],
  ref: '参考属性：第一年温宁珊，第二年林妮雯，第三年方若绮',
};

export interface EventTip {
  title: string;
  tag?: string;
  lines: string[];
}
export const EVENT_TIPS: EventTip[] = [
  {
    title: '马智文事件',
    tag: '可赚800万',
    lines: [
      '买回公司后2个月内资金能达到1200万才完成',
      '欠款新闻出来后1月内，酒馆内找马智文（W3以外）',
      '嗑药、事业停摆新闻出来后2周内，酒馆找马智文',
    ],
  },
  {
    title: '方若绮NP鸡出走事件',
    tag: '完成可获得五星唱片《爱·隐》',
    lines: [
      '新闻人鸡情深 → EAMI二楼，方若绮与林明扬冲突',
      '新闻NP鸡闯祸了 → 周四/周六去EAMI二楼找方若绮，接委托',
      '酒馆，老板娘给羽毛 → 2周内周四/周六交付给方若绮',
      '去酒馆2次，得到NP鸡；一周内交给方若绮（周四/周六）',
    ],
  },
  {
    title: '贺总财务危机',
    lines: [
      '别自卑，借钱并不可耻',
      '一个月内，周三找记者：不做这种龌龊事',
      '贺总澄清后，有几率开启矩子，贺总吐苦水，最多3次',
    ],
  },
  {
    title: '暗夜惊魂',
    lines: ['触发后请跟随相应艺人电影通告21天以上'],
  },
];

export interface GroupEnding {
  name: string;
  award: boolean;
  chorus: string;
  concert: string;
}
export const GROUP_ENDINGS: GroupEnding[] = [
  { name: '国际第一天团', award: true, chorus: '京风5', concert: '2' },
  { name: '亚洲第一天团', award: true, chorus: '京风2', concert: '2' },
  { name: '国内第一天团', award: true, chorus: '3', concert: '2' },
  { name: '国际知名团体', award: false, chorus: '京风5', concert: '' },
  { name: '亚洲知名团体', award: false, chorus: '京风2', concert: '' },
  { name: '国内知名团体', award: false, chorus: '3', concert: '' },
];
export const GROUP_NOTE = '「团体奖」一列需要开过团体演唱会（不论规模大小）';
