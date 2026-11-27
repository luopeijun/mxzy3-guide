/** Reads the current notices and their rolled ability thresholds from a
 *  Stardom 3 (Traditional Chinese 3-in-1) *.sa2 save file.
 *
 *  Everything happens in the browser on the uploaded ArrayBuffer: no upload to
 *  a server, no network request beyond the bundled static tables. The game
 *  keeps only ranges in data/Difficulty.tab; the concrete thresholds rolled for
 *  this playthrough live in the save's `Case` block, one 192-byte record per
 *  role. `CaseFirm` lists the notices registered for the current period.
 *
 *  Layout mirrors scripts/build_case_tables.py and the standalone
 *  parse_case_values.py probe; keep the offsets in sync when either changes.
 */

import { nextTitle, type TitleNext } from './titleLadder';

export const ATTRS = ['演技', '口才', '歌艺', '名气', '仪态', '动感', '体能', '才智', '自信'] as const;
/** 游戏「通告统计」用的那一套名字，顺序 = 存档状态块 +248 起那五个计数
 *  （电视 / 电影 / 唱片 / 广告 / 主持）。称号门槛（Nickname.tab）里写的是
 *  「电视作品 / 电影作品 / 专辑 / 节目」，页面靠 NOTICE_COUNT_ALIAS 统一成
 *  这一套，免得同一个东西两个叫法。 */
export const NOTICE_COUNT_LABELS = ['电视', '电影', '唱片', '广告', '主持'] as const;
/** 与 NOTICE_COUNT_LABELS 同序，游戏界面上跟在数字后面的单位。 */
export const NOTICE_COUNT_UNITS = ['部', '部', '张', '支', '档'] as const;
/** 六项里的最后一项：上面五个数字相加（单位不齐，所以不带单位）。 */
export const NOTICE_TOTAL_LABEL = '作品总数';
/** 称号表里的作品门槛名 → 通告统计的叫法。 */
export const NOTICE_COUNT_ALIAS: Record<string, string> = {
  电视作品: '电视', 电影作品: '电影', 专辑: '唱片', 节目: '主持',
};

/** 甜蜜乐章多出来的三类作品门槛用的单位；主站表不会出现这些名字。 */
const EXTRA_NOTICE_UNITS: Record<string, string> = {
  舞台剧: '场', 走秀: '场', 演唱会: '场',
};

/** 门槛 / 统计的统一显示名。 */
export function noticeLabel(label: string): string {
  return NOTICE_COUNT_ALIAS[label] ?? label;
}

/** 与 noticeLabel 配套的单位；作品总数没有单位。 */
export function noticeUnit(label: string): string {
  const text = noticeLabel(label);
  const index = NOTICE_COUNT_LABELS.indexOf(text as (typeof NOTICE_COUNT_LABELS)[number]);
  return index >= 0 ? NOTICE_COUNT_UNITS[index] : EXTRA_NOTICE_UNITS[text] ?? '';
}
const GRADES = ['', 'A', 'B', 'C', 'D'];
const WEEKDAYS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** The two-letter code prefix is the notice category; no static table needed. */
export const CATEGORY_BY_PREFIX: Record<string, string> = {
  CD: '唱片', CF: '广告', MV: '电影', TV: '电视剧', SH: '主持',
  FS: '时装', TH: '舞台剧', SP: '特别',
};

export function categoryOf(code: string): string {
  return CATEGORY_BY_PREFIX[code.slice(0, 2)] ?? '其他';
}

/** Length 表用的通告种类。电视剧/主持的 subtype 本身就是种类，唱片则要把
 *  個人/團體/原聲帶 归到「唱片」这一行，所以按前缀补一层。 */
const KIND_BY_PREFIX: Record<string, string> = {
  CD: '唱片', CF: '廣告', MV: '電影', TV: '', SH: '',
};

/** 已被其他艺人预约的角色（角色码 -> 艺人名）。
 *
 *  这一列回答的是「这个角色已被谁占掉，所以我接不了」。**只能来自存档**，
 *  不能凭印象硬填：角色记录本身只保存通告的角色定义（同一张通告在两个
 *  存档里逐字节相同），预约关系记在艺人的行程上，目前还没有解出可用的
 *  字段，所以这里保持为空 —— 读不到就不显示，宁缺勿错。 */
export const RESERVED_ROLES: Record<string, string> = {};

/** A role may be gender-restricted (男主角 / 女性 …) or open to anyone. */
export type Gender = 'female' | 'male' | 'any';

/** Role names carry their own gender: 男主角/男配角/男性, 女主角/女配角/女性.
 *  Names like 外景主持 / 助理主持 / 個人 / 團體 have no gender restriction. */
export function roleGender(roleName: string): Gender {
  if (roleName.includes('女')) return 'female';
  if (roleName.includes('男')) return 'male';
  return 'any';
}

/** A gender-restricted role is only comparable against matching artists.
 *  'any' on either side means no restriction (also keeps the fixture tests
 *  that call matchRole without a gender happy). */
export function canTakeRole(role: RoleRecord, gender: Gender): boolean {
  return gender === 'any' || role.gender === 'any' || role.gender === gender;
}

/** Artist gender comes only from the game data table StarRole.dat (baked into
 *  `tables.stars`), which also covers NPCs. The save itself stores no gender
 *  field for artists, and the hand-written directory no longer carries one.
 *  Unknown ids fall back to 'any' so they never get locked out of a role. */
export function starGender(roleId: number, stars: CaseTables['stars'] | undefined): Gender {
  const entry = stars?.[String(roleId)];
  if (!entry) return 'any';
  return entry[1] ? 'male' : 'female';
}

/** The 18 signable artists, numbered as in the game's save-editor roster.
 *  The number is the game's own role id; each artist state block stores that
 *  same id 16 bytes before its nine abilities, so no guessing is needed.
 *  Gender is NOT stored here: it comes from the game's StarRole.dat (baked into
 *  `tables.stars`), which also covers every NPC. */
export interface ArtistDirectoryEntry {
  id: number;
  name: string;
  /** Traditional-Chinese spelling used by the save's Big5 name table. */
  traditional: string;
}

export const ARTIST_DIRECTORY: ArtistDirectoryEntry[] = [
  { id: 1, name: '林芬芬', traditional: '林芬芬' },
  { id: 2, name: '桑禾蓓', traditional: '桑禾蓓' },
  { id: 3, name: '欧怡青', traditional: '歐怡青' },
  { id: 4, name: '苏嫚君', traditional: '蘇嫚君' },
  { id: 5, name: '路敏', traditional: '路敏' },
  { id: 6, name: '萧依莉', traditional: '蕭依莉' },
  { id: 7, name: '天晴', traditional: '天晴' },
  { id: 8, name: '陈奕夫', traditional: '陳奕夫' },
  { id: 9, name: '关古威', traditional: '關古威' },
  { id: 10, name: '路风', traditional: '路風' },
  { id: 11, name: '纪翔', traditional: '紀翔' },
  { id: 12, name: '姚子奇', traditional: '姚子奇' },
  { id: 65, name: '姚子莹', traditional: '姚子瑩' },
  { id: 72, name: '克烈斯', traditional: '克烈斯' },
  { id: 74, name: '新名纱雪', traditional: '新名紗雪' },
  { id: 75, name: '聆香', traditional: '聆香' },
  { id: 76, name: '卫亚', traditional: '衛亞' },
  { id: 77, name: '原少纬', traditional: '原少緯' },
];

/** Ids 78 / 79 are placeholder blocks whose nine abilities are all 1111. */
export const PLACEHOLDER_ARTIST_IDS = [78, 79];

const PREFIXES = ['CD', 'CF', 'MV', 'TV', 'SH', 'FS', 'TH', 'SP'];
const NAME_BLOCKS = [
  'Case', 'CaseEnd', 'CaseFirm', 'CaseCreate', 'PrepareCase',
  'StarRoleQ', 'Firm', 'Team', 'Schedule',
];

/** 称号所属的职业线，页面按这个上色。 */
export type TitleLine = 'music' | 'host' | 'model' | 'screen' | 'star' | 'other';

/** Nickname.tab 里边角信息：线、媒介标签、男女限定、达标门槛。 */
export interface TitleMeta {
  line: TitleLine;
  /** 作品媒介：CD 唱片 / SH 主持 / CF 广告 / MV 电影 / TV 电视 / 0 通用。 */
  tag: string;
  /** -1 通用、1 男、0 女。 */
  sex: number;
  /** [门槛名, 数值]：先是属性（0~1000），再是作品数。 */
  need: [string, number][];
  /** 本线第几档（0 起，越大越高）；过气艺人之类不在梯子上的是 null。 */
  rank?: number | null;
}

export interface CaseTables {
  source: string;
  /** code -> [name, type, subtype, company] */
  cases: Record<string, string[]>;
  /** `type|role` -> nine ability grades (0 none, 1 A, 2 B, 3 C, 4 D) */
  needEffect: Record<string, number[]>;
  /** `kind|role` -> [工作天数, 每週可排天数上限]. */
  length?: Record<string, number[]>;
  /** star 1..5 -> [[A lo,hi], [B lo,hi], [C lo,hi], [D lo,hi]] */
  difficulty: number[][][];
  /** 艺人编号 -> [名字, 性别]（1 男 0 女），用来给「已被谁预约」署名。 */
  stars?: Record<string, [string, number]>;
  /** 称号编号 -> 简体称号名，来自 Nickname.tab；存档艺人块 -12 处存的就是这个编号。 */
  titles?: Record<string, string>;
  /** 称号编号 -> 线 / 媒介 / 门槛，用来给徽标上色和做 hover 说明。 */
  titleMeta?: Record<string, TitleMeta>;
  /** company id -> name */
  firms: Record<string, string>;
  /** 道具 code -> [名称, 分类, 说明, 属性行]，来自 Item.dat 烘焙。 */
  items: Record<string, string[]>;
  /** 道具 code -> 21 个送礼对象的好感加成（0..4），Item.dat 每条记录的尾字段。 */
  gifts?: Record<string, number[]>;
  /** 艺人编号 -> 送礼槽位（0/16/20 未使用，故没有艺人映射过去）。 */
  giftSlots?: Record<string, number>;
}

export const EMPTY_TABLES: CaseTables = {
  source: '', cases: {}, needEffect: {}, length: {}, difficulty: [],
  stars: {}, titles: {}, titleMeta: {}, firms: {}, items: {},
  gifts: {}, giftSlots: {},
};

export interface Requirement {
  attr: string;
  value: number;
  /** Grade from the static NeedEffect table. */
  staticGrade: string;
  /** Grade inferred from the value and the star's difficulty ranges. */
  rolledGrade: string;
  /** 社交接演门槛（叛逆/性感/亲和）没有 A/B/C 等级，UI 用这个标记区分显示。 */
  social?: boolean;
}

/** 角色记录里 `off+76 / +80 / +84` 的三个接演门槛，与艺人 social 的前三项同序同量纲。 */
export interface SocialThresholds {
  rebellion: number;
  sexy: number;
  affinity: number;
}

export interface RoleRecord {
  code: string;
  roleCode: string;
  role: string;
  /** Gender required by this role, derived from its Big5 name. */
  gender: Gender;
  star: number;
  values: Record<string, number>;
  /** 从存档读取的社交接演门槛；三项都是 0 表示这个角色没有额外要求。 */
  social: SocialThresholds;
  requirements: Requirement[];
  /** Artist who has booked this role, e.g. 黎华. Empty means available. */
  reservedBy: string;
  offset: number;
  /** 通告解析时按 Length 表填入的角色自己的工作天数 / 每周上限。
   *  电视剧 / 电影里男主角、男配角、女主角、女配角天数各不相同，不能只取通告第一个角色。 */
  workDays?: number;
  daysPerWeek?: number;
}

/** 'upcoming' not open yet, 'open' bookable, 'closing' deadline within 7 days,
 *  'expired' past the deadline. */
export type NoticeStatus = 'upcoming' | 'open' | 'closing' | 'expired';

export interface CaseNotice {
  code: string;
  name: string;
  /** Broad category derived from the code prefix, e.g. TV -> 电视剧. */
  category: string;
  /** Fine-grained programme type from the static tables, e.g. 愛情偶像劇. */
  type: string;
  subtype: string;
  company: string;
  firmSlot: number;
  firmName: string;
  /** [open for booking (Monday), shooting start (Monday), shooting end (Sunday)]. */
  openDate: string;
  periodStart: string;
  periodEnd: string;
  /** One day before shooting starts, i.e. the last day to accept. */
  deadline: string;
  /** Inclusive length of the shooting period. */
  execDays: number;
  /** 需要的工作天数 (游戏 Length 表), 0 when the table has no match. */
  workDays: number;
  /** 每週最多可排几天工作, 0 when unknown. */
  daysPerWeek: number;
  /** Signed day counts relative to the game's current date. */
  daysToOpen: number;
  daysToDeadline: number;
  daysToStart: number;
  daysToEnd: number;
  /** Executed / remaining days when shooting is in progress, else 0. */
  executedDays: number;
  remainingDays: number;
  status: NoticeStatus;
  roles: RoleRecord[];
}

/** 这张通告上还有几个角色没被人接走。
 *  存档里没有该通告的角色记录时也是 0 —— 那是「不知道」，不是「满了」。 */
export function freeRoleCount(notice: CaseNotice): number {
  return notice.roles.reduce((sum, role) => (role.reservedBy ? sum : sum + 1), 0);
}

/** 现在还能接取：还没停止接取（`open` / `closing`），并且至少有一个角色空着。
 *  「下周更新」的还没开放、已停止接取的也进不去，所以都不算；读不到角色记录的
 *  同样不算 —— 宁可漏掉，不要让人照着一条其实接不了的通告去排档期。
 *
 *  这是「未预约」那一档：只问还有没有角色没人接，**我方接不接得上另说**，
 *  能不能接还要看自家艺人性别与数值，见 `canTakeNotice()`。 */
export function isAcceptable(notice: CaseNotice): boolean {
  if (notice.status !== 'open' && notice.status !== 'closing') return false;
  return freeRoleCount(notice) > 0;
}

/** 「满足条件」：角色未预约，并且至少有一个空角色自家接得上。
 *  `fits` 由调用方给 —— 主站拿 `matchRole()` / `matchGroupRole()` 判断性别与九项
 *  数值是否都够，这里只管「未预约 + 有人达标」这件事本身，方便单测。 */
export function canTakeNotice(
  notice: CaseNotice,
  fits: (role: RoleRecord) => boolean,
): boolean {
  if (!isAcceptable(notice)) return false;
  return notice.roles.some((role) => !role.reservedBy && fits(role));
}

/** One artist state block, read straight from the uploaded save. Field order
 *  was checked field-by-field against the game's save-editor panel. */
export interface ArtistStats {
  /** 友好度，整数、不缩放；来自存档头部的角色友好度表，缺记录时为 null。 */
  friendship: number | null;
  /** Nine ability values, in the same order as ATTRS. */
  abilities: number[];
  stress: number;
  fatigue: number;
  /** [叛逆, 性感, 亲和, 人气, 曝光] */
  social: number[];
  /** 送过的礼物数；来自存档头部友好度表的第二格，缺记录时为 0。 */
  gifts: number;
  /** 电视 / 电影 / 唱片 / 广告 / 主持 已完成作品数。
   *  直接用游戏自己算好的那 5 个数字（状态块 +248 起），它已经包含加入公司
   *  之前的履历，也不把还在拍的通告算进去。 */
  noticeCounts: number[];
  /** Short Big5 status label such as 正常. */
  condition: string;
  /** 游戏内称号编号，存在状态块起始前 12 字节；0 = 还没有称号（例如刚签下、还没作品）。 */
  titleId: number;
  /** 称号名（简体），由 titleId 查烘焙进站点的 Nickname 表得来；读不到就是空串。 */
  title: string;
  /** 称号的线与门槛；查不到就是 null（例如称号表里没有这个编号）。 */
  titleMeta: TitleMeta | null;
  /** 同一条线的下一档称号，以及离它差多少；已是本线最高档就是 null。 */
  titleNext: TitleNext | null;
  /** The game's roster number, stored 16 bytes before the nine abilities. */
  roleId: number;
  /** 1 means this artist is currently signed by the player's company. */
  signed: boolean;
  offset: number;
  index: number;
  /** 这位艺人拿过的奖，最近的排在最前；公司奖也在里面，看 `company` 分流。 */
  awards: ArtistAward[];
  /** 这位艺人办过的演唱会 / 影友會 / 歌友會，按时间正序。 */
  events: ArtistEvent[];
  /** 当前合约；未签约（含已解约）时为 null，不拿占位日期冒充。 */
  contract: ArtistContract | null;
}

/** 艺人状态块 +308 起的当前合约信息。 */
export interface ArtistContract {
  /** `2006/1/1`。 */
  signDate: string;
  /** `2010/1/24`。 */
  expireDate: string;
  /** 签约金，单位元；0 也照实显示。 */
  signingBonus: number;
  /** 艺人分红，百分比整数，例如 50 表示 50%。 */
  dividend: number;
}

/** 「艺人成绩」记事里的一条举办活动记录。 */
export interface ArtistEvent {
  /** `2008/4/19`，界面直接用。 */
  date: string;
  year: number; month: number; day: number;
  /** 直接可显示的名字，例如「中型個人演唱會」「大型團體演唱會」。 */
  label: string;
  /** 61 歌友會 / 62 影友會 / 63 演唱會。 */
  kind: number;
  /** 1 大型 / 2 中型 / 3 小型。 */
  scale: number;
  /** 团体专场（记事 +24 非零）；个人场为 false。 */
  group: boolean;
  /** 记事挂名的艺人编号。 */
  artistId: number;
}

/** 存档「艺人成绩」记事里的一条获奖记录。 */
export interface ArtistAward {
  /** 获奖年份 / 月份；记事只到月，没有更细的日期。 */
  year: number;
  month: number;
  /** `2006/2`，界面直接用。 */
  date: string;
  /** 颁奖礼：金曲奖 / 金像奖 / 金钟奖 / 金星奖。 */
  ceremony: string;
  /** 单项名，例如 最上镜头、最佳代言人。 */
  label: string;
  /** 奖项编号 21..53；排错和测试用。 */
  awardId: number;
  /** 获奖作品编码，例如 CF159；剧情 / 自制通告可能读不到。 */
  workCode: string;
  /** 获奖作品名，查不到静态表时退回编码。 */
  workName: string;
  /** 非个人奖（团体奖 + 公司奖），存档挂在团长或主唱名下。 */
  company: boolean;
  /** 团体奖（最佳团体）：归到获奖者所在团体，不挂个人卡。 */
  group: boolean;
  /** 存档里的艺人编号。 */
  artistId: number;
}

/** 「艺人成绩」记事里的一条团体唱片发行记录。 */
export interface GroupWork {
  /** `2007/2/28`，界面直接用。 */
  date: string;
  year: number; month: number; day: number;
  /** 作品编码，例如 CD053。 */
  workCode: string;
  /** 作品名，查不到静态表时退回编码。 */
  workName: string;
  /** 制作公司，来自静态通告表 cases[code][3]。 */
  company: string;
  /** 记事 `+24` 的团体代表艺人编号，页面据此归到所在团体。
   *  注意不是 `+20` 的挂名艺人：换过成员的团体里两者可能分属不同团
   *  （Ending0007 的 CD053 `+20=76` 已在沙啞之歌、`+24=77` 属緯少集團，官方归后者）。 */
  artistId: number;
}

/** 「艺人成绩」记事里的一条作品记录，可归到五个通告统计分类。 */
export interface WorkRecord extends GroupWork {
  /** 对应 NOTICE_COUNT_LABELS / artist.noticeCounts 的下标 0..4。 */
  noticeIndex: number;
  /** 记事表没有记录每位艺人在这部作品里的角色，一律留空，不按性别猜。 */
  role: string;
  /** 参与清单里的原始顺序（就是游戏里的发生顺序），仅用于 hover 排序。 */
  order?: number;
  /** 游戏内「第 N 部」序号（记事表 +36）。有它就能把被挤掉的早期作品
   *  的占位放回正确位置：陈奕夫主持 SH067=第3部、SH072=第4部，缺的第
   *  1、2 部是加入公司前的通告，占位要排在明细前面，不能一律补末尾。 */
  seq?: number;
}

/** 记事表每条记录的固定字节数，表头是 `[条数][108]`。 */
const DIARY_STRIDE = 108;

/** 记事项类型 -> 通告统计分类。11 电视 / 12 电影 / 13 唱片 / 14 广告 / 15 主持。 */
const DIARY_WORK_TYPE: Record<number, number> = { 11: 0, 12: 1, 13: 2, 14: 3, 15: 4 };
const WORK_CODE_PREFIX = ['TV', 'MV', 'CD', 'CF', 'SH'];

/** 记事表 kind=6 是「举办活动」：61 歌友會 / 62 影友會 / 63 演唱會。
 *  62、63 已用 Auto 存档的游戏界面核对；61 按同一枚举顺序补上，样本存档里
 *  暂时没有歌友會记录。事项后的 +36 是规模（1 大型 / 2 中型 / 3 小型）。 */
const DIARY_EVENT_NAME: Record<number, string> = {
  61: '歌友會', 62: '影友會', 63: '演唱會',
};
const DIARY_EVENT_SCALE = ['', '大型', '中型', '小型'];

/** 奖项编号的十位 -> 颁奖礼。 */
const AWARD_CEREMONY: Record<number, string> = {
  2: '金曲奖', 3: '金像奖', 4: '金钟奖', 5: '金星奖',
};

/** 奖项编号 -> 单项名。编号从主程序里那张分支跳表反推（跳表下标 = 编号 - 21），
 *  再用「性别 / 作品类型必须自洽」交叉验过：43 的获奖作品一律是主持、32 只有
 *  女艺人、51 / 53 只有广告。游戏内电影那个奖叫金像奖，不是金马奖。 */
export const AWARD_NAMES: Record<number, string> = {
  21: '最佳新人', 22: '最佳演唱人', 23: '最佳团体', 24: '年度专辑',
  31: '最佳男主角', 32: '最佳女主角', 33: '最佳男配角', 34: '最佳女配角',
  41: '最佳男演员', 42: '最佳女演员', 43: '最佳主持人', 44: '年度戏剧',
  51: '最上镜头', 52: '最佳模特儿', 53: '最佳代言人',
};

/** 这三个不是个人奖：存档照样挂在某位艺人名下，界面按团体 / 公司分流。
 *  23 最佳团体是团体荣誉，归到获奖者所在团体；24 / 44 是公司作品奖。 */
export const COMPANY_AWARD_IDS = [23, 24, 44];
/** 团体奖编号：只挂到「我方团体」，既不进艺人卡也不进公司卡的奖项行。 */
export const GROUP_AWARD_IDS = [23];

/** 记事表里的「得奖」事件类型。类型 5 配事项编号 11..15 是作品下档，不是奖。 */
const DIARY_AWARD_KIND = 5;

/** One selectable artist in the top panel: fixed roster number plus whichever
 *  state block the save happens to contain for them. */
export interface ArtistOption extends ArtistDirectoryEntry {
  /** 来自游戏数据表 StarRole.dat；表里没有的编号是 'any'。 */
  gender: Gender;
  /** null when this artist has no state block in this save yet. */
  artistIndex: number | null;
  signed: boolean;
  /** 存档里的称号名；空串表示还没有称号。 */
  title: string;
  /** Nine abilities, for the roster chip tooltip. */
  abilities: number[];
}

export interface RosterEntry {
  id: number;
  name: string;
}

export interface GameDate {
  y: number;
  m: number;
  d: number;
  weekday: number;
  text: string;
  label: string;
  dayNumber: number;
}

/** 我方公司的四件套。
 *
 *  公司名与主角姓名在存档头部的定长字段里（@4 20 字节 / @24 16 字节，Big5，
 *  遇 NUL 截断）；资金是头部 @80 的 int32。形象 / 知名度 / 公关 不在头部，
 *  而在 `Firm` 段：段体先是公司数量，然后每家一条
 *  `[编号][形象字节数][每字节一个 int32][知名度][公关][0]`，编号 1 就是我方，
 *  2..5 是对手公司（名字在游戏的 Firm.dat 里，存档只记数值）。 */
export interface CompanyInfo {
  /** 公司名称。 */
  name: string;
  /** 主角姓名。 */
  protagonist: string;
  /** 公司形象，例如「注入新血的」。 */
  image: string;
  /** 知名度（存档里 ×10，这里已除回游戏界面的值）。 */
  fame: number;
  /** 公关（同样已 ÷10）。 */
  pr: number;
  /** 资金，可能是负数（负债）。 */
  money: number;
  /** 这条记录在存档里的位置，排错用。 */
  offset: number;
}

/** One Monday update batch of a production company, built from the notices the
 *  reader is actually showing (their 接取日 = 开放接取那个周一). */
export interface UpdateBatch {
  date: string;
  dayNumber: number;
  label: string;
  companies: string[];
  kinds: string[];
  codes: string[];
  daysAway: number;
  /** true = the save already contains this batch; false = extrapolated. */
  scheduled: boolean;
}

/** A team the player has formed, read straight from the save.
 *  The save keeps them in its `Team` section: [编码][名字节长度][Big5 名字] and
 *  the member artist numbers a fixed distance after the name. 我方团体从 101 起；
 *  存档里没有这条记录，就是旗下没有团体。 */
export interface TeamRecord {
  /** 团体编码：101、102…，读不到就是旗下没有团体。 */
  code: number;
  /** 团体名，直接取存档里的 Big5 字符串。 */
  name: string;
  /** 成员艺人编号，第 0 个就是队长。 */
  memberIds: number[];
  /** 存档里这条记录的位置。 */
  /** 团体已完成的唱片作品数，存档 nameEnd+24；团体只接唱片通告。
   *  这是游戏自己维护的累计值（Auto 千金小姐 6、Ending0001 莎亞之音 10），
   *  不用去重数作品清单。 */
  workCount: number;
  /** 团体名气：存档 nameEnd+4 是千分位累计值，界面显示 floor(raw / 1000)。 */
  fame: number;
  /** 团体人气：存档 nameEnd+8 是千分位累计值，界面显示 floor(raw / 1000)。 */
  popularity: number;
  offset: number;
}

/** A team as shown in the reader: ids resolved to names via ARTIST_DIRECTORY. */
export interface GroupRecord extends TeamRecord {
  leaderId: number;
  leaderName: string;
  memberNames: string[];
}

/** A role whose name contains 團體 / 团体 is filled by a group, not a solo
 *  artist, so its numeric match should be tested against the group's leader. */
export function isGroupRole(role: RoleRecord): boolean {
  return /團體|团体/.test(role.role);
}

/** Group-role match: only the leader's personal abilities matter; member
 *  stats are irrelevant, per the player's rule. */
export function matchGroupRole(
  role: RoleRecord,
  leader: ArtistStats | null,
  groupName: string,
  leaderName: string,
): MatchResult {
  const gaps: MatchResult['gaps'] = ATTRS
    .filter((attr) => role.values[attr])
    .map((attr) => {
      const need = role.values[attr];
      const have = leader?.abilities[ATTRS.indexOf(attr)] ?? 0;
      return { attr, need, have, diff: need - have };
    });
  for (const [key, attr, idx] of [['rebellion', '叛逆', 0], ['sexy', '性感', 1], ['affinity', '亲和', 2]] as const) {
    const need = role.social[key];
    if (!need) continue;
    const have = leader?.social[idx] ?? 0;
    gaps.push({ attr, need, have, diff: need - have, social: true });
  }
  const missing = gaps.filter((gap) => gap.diff > 0);
  return {
    artistIndex: leader?.index ?? -1,
    // 团体通告是「整团」接的：名字写队名，队长与成员由 UI 另起一行列全。
    artistName: groupName || leaderName,
    eligible: true,
    canAccept: missing.length === 0,
    gaps,
    missing: missing.length,
  };
}

/** One row of the save's owned-item list.
 *
 *  存档里这是一段连续的 16 字节小端记录：`[编号, 状态码, 数量, 附字段]`，
 *  一段通常几十到上百条。编号是游戏里统一的道具 id（例如 917 = 附着唇印的卡片）；
 *  `数量` 为 0 表示背包里没有（UI 不展示）。名称 / 分类 / 说明 / 属性行来自烘焙进
 *  case-tables.json 的道具表（Item.dat），存档本身不带这些文本。 */
export interface OwnedItem {
  code: number;
  flag: number;
  quantity: number;
  meta: number;
  /** 道具名称（来自道具表，缺省回退为「道具 <code>」）。 */
  name?: string;
  /** 分类：一般物品 / 特殊物品 / 公司物品（来自道具表的 type 字段）。 */
  category?: string;
  /** 物品说明（来自道具表，可能为空）。 */
  desc?: string;
  /** 属性行，如「儀態+5  自信+5」（来自道具表，可能为空）。 */
  stats?: string;
}

/** 8 个国际场景的固定表。名称来自 World.tab 记录 1..8，费用来自记录 0
 *  +28 起的 8 个 int32（11000 / 7000 / 11000 / 13000 / 13000 / 10000 /
 *  15000 / 21000），跟游戏「世界脈動 → 國外情報」显示的价格一致。 */
export const WORLD_SCENES = [
  { name: '长城', cost: 11000 },
  { name: '东京', cost: 7000 },
  { name: '好莱坞', cost: 11000 },
  { name: '巴黎', cost: 13000 },
  { name: '维也纳', cost: 13000 },
  { name: '夏威夷', cost: 10000 },
  { name: '纽约', cost: 15000 },
  { name: '开罗', cost: 21000 },
] as const;

/** 国际场景记录的锚点：编号 int32 小端 = 2（長城）。8 条记录编号 2..9，
 *  固定间隔 0xA0，顺序与 WORLD_SCENES 一致（长城→开罗）。 */
const WORLD_SCENE_FIRST_ID = 2;
const WORLD_SCENE_RECORD_STRIDE = 0xa0;

export interface WorldScene {
  name: string;
  cost: number;
  unlocked: boolean;
}

/** 通告记录表里的七种状态分类，对应游戏存档编辑器「通告列表」的下拉项。 */
export type ArchiveNoticeCategory =
  | '宣傳活動'
  | '籌備中'
  | '拍攝中'
  | '等待上市'
  | '熱賣中'
  | '已完成'
  | '自製通告及其他';

/** 宣传活动的六种子类，来自存档记录内「通告码后紧跟的类型码」。 */
export type PromoKind =
  | '電視劇宣傳'
  | '電影宣傳'
  | '首映會'
  | '唱片宣傳'
  | '拍攝MV'
  | '簽名會';

/** 通告记录表（存档里一段变长记录，每条约 1100~1200 字节）里的一条。
 *  只读清单用：通告名 + 类型 + 档期 + 参与艺人；角色明细（角色类型/难度/
 *  签约艺人/完成天数/酬劳）保留在原始字段，后续展开时再用。 */
export interface ArchiveNotice {
  code: string;
  name: string;
  category: ArchiveNoticeCategory;
  /** 开拍日文本，例如 2006/7/31。 */
  startDate: string;
  /** 杀青日文本。 */
  endDate: string;
  /** 该通告的签约艺人（roleId），来自角色槽位 +800 / +824。 */
  artistIds: number[];
  /** 宣传活动的子类；只有 category === '宣傳活動' 时有值。 */
  promoKind?: PromoKind;
  /** 宣传活动的签约团体名；团体宣传时有值。 */
  groupName?: string;
  /** 宣传活动的完成天数；读不到时为 null。 */
  doneDays?: number | null;
  /** 团体宣传的团体 code（存档 +772，101/102…）；配合 teams 映射成名字。 */
  groupId?: number;
  /** 杀青日的 dayNumber，供 UI 按「当前日期是否在档期内」过滤整组宣传。 */
  endDayNum?: number;
  /** 宣传活动里每个角色槽的明细（角色名 / 签约艺人编号 / 该角色宣传天数）。团体宣传只有一条。 */
  promoCasts?: PromoCast[];
  /** 所有个人通告的 4 个原始角色槽（含筹备中），只供预约/作品角色索引使用，不进宣传 UI。 */
  castSlots?: PromoCast[];
  /** 等待上市 / 热卖中 / 已完成：发行档期起（上市日，文本）。来自本体记录第 4 组档期。 */
  saleStart?: string;
  /** 等待上市 / 热卖中 / 已完成：发行档期止（下市日，文本）。来自本体记录第 5 组档期。 */
  saleEnd?: string;
  /** 等待上市 / 热卖中 / 已完成：本体记录的酬劳（首角色 +816）。 */
  pay?: number | null;
  /** 通告编辑器「其他信息」里的六个数（个人 +972 / 团体式 +1004 起）。 */
  otherInfo?: string;
}

/** 通告记录里一个角色槽的明细（宣传活动与等待上市共用）。 */
export interface PromoCast {
  /** 角色名（女主角 / 男配角 / 個人 / 團體…）。 */
  roleName: string;
  /** 签约艺人编号（roleId）；团体宣传取代表艺人。 */
  artistId: number;
  /** 该角色在这一条通告里的完成天数。 */
  doneDays: number;
  /** 团体宣传的团体 code；个人宣传为 0。 */
  groupCode: number;
  /** 该角色的酬劳（个人记录 +816+i*24）；读不到为 null。 */
  pay?: number | null;
  /** 精确角色号（通告码 + 槽位序号），用于把预约/作品角色落到具体角色格。 */
  roleCode?: string;
}

export interface ParseResult {
  saveName: string;
  saveSize: number;
  readAt: string;
  blocks: Record<string, [number, number]>;
  roleRecordCount: number;
  notices: CaseNotice[];
  /** 已在拍 / 待开拍的通告（只看自己旗下艺人），来自存档里的接取记录。 */
  shooting: ShootingNotice[];
  /** 「自制通告及其他」：玩家自己出品的通告清单，按制作顺序。 */
  selfMade: SelfMadeNotice[];
  artists: ArtistStats[];
  /** 艺人编号 -> 友好度（整数），独立于状态块的头部友好度表。 */
  friendship: Record<number, number>;
  /** 角色编号 -> 友好度（整数），来自 284 字节定长友好度表：制作人（4xx/5xx/6xx/7xx）
   *  与 NPC / 其他角色（3 賀總 / 38 史蒂芬 / 39 丹尼斯…）同表，按编号反查。 */
  producerFriendship: Record<number, number>;
  /** 角色编号 -> 存档里的 Big5 繁体名字（同表 +8），制作人卡以它为真源。 */
  producerNames: Record<number, string>;
  /** 角色编号 -> ASCII 项目代号（同表 +181），如 EAMI_CD / LCTV_Drama；NULL 与 Role_* 占位不收。 */
  producerProjects: Record<number, string>;
  /** The 18 signable artists, resolved against the state blocks in this save. */
  artistDirectory: ArtistOption[];
  /** Numbers of the artists the save marks as signed (1..4 of them). */
  signedArtistIds: number[];
  /** Live 人气 / 名气 / 通告数量 keyed by team code, read straight from the save.
   *  The player's actual groups are chosen in the UI from the static KNOWN_TEAMS;
   *  this map only supplies the numbers for whichever codes the save contains. */
  teams: TeamRecord[];
  /** Full 284-byte role-name table at the head of the save. */
  roster: RosterEntry[];
  /** Dates from the save header, used for all countdowns. */
  currentDate: GameDate | null;
  /** 我方公司：名称 / 主角 / 形象 / 知名度 / 公关 / 资金。 */
  company: CompanyInfo | null;
  /** 「艺人成绩」记事里的全部获奖记录，最近的在前。 */
  /** 「艺人成绩」记事里的团体唱片发行记录（时间/作品/公司）。 */
  groupWorks: GroupWork[];
  /** 「艺人成绩」记事里的个人作品记录，供通告统计悬停按时间展示。 */
  works: WorkRecord[];
  /** 存档「通告记录表」里的全部通告，按七类状态分类，供通告区只读清单使用。 */
  archiveNotices: ArchiveNotice[];
  awards: ArtistAward[];
  /** 「艺人成绩」记事里的演唱会 / 影友會 / 歌友會记录，按时间正序。 */
  events: ArtistEvent[];
  /** Monday notice-update batches, oldest first. */
  batches: UpdateBatch[];
  /** First batch strictly after today, i.e. the next company refresh. */
  nextUpdate: UpdateBatch | null;
  /** Codes in CaseFirm that the bundled static tables do not know. */
  unknownCodes: string[];
  /** 存档里解析出的整段道具清单（含数量 0 的），UI 只展示数量 > 0 的。 */
  items: OwnedItem[];
  /** 世界场景解锁表：8 个国际场景，1 = 已解锁。 */
  scenes: WorldScene[];
}

let decoder: TextDecoder | null = null;

/** Big5 is the encoding of the Traditional Chinese release. All modern
 *  browsers ship the WHATWG `big5` decoder; fail loudly if one does not. */
function decodeBig5(bytes: Uint8Array): string {
  if (!decoder) {
    try {
      decoder = new TextDecoder('big5');
    } catch {
      throw new Error('当前浏览器不支持 Big5 解码，无法读取游戏内的繁体文字。请换用 Chrome / Edge / Firefox 再试。');
    }
  }
  return decoder.decode(bytes);
}

/** NUL-terminated Big5 string, with the surrounding NULs trimmed like the
 *  Python probe does (an interior NUL survives and is rejected later). */
function big5String(bytes: Uint8Array, start: number, end: number): string {
  return decodeBig5(bytes.subarray(start, end)).replace(/^\0+|\0+$/g, '');
}

function asciiString(bytes: Uint8Array, start: number, end: number): string {
  const slice = bytes.subarray(start, end);
  const stop = slice.indexOf(0);
  const body = stop < 0 ? slice : slice.subarray(0, stop);
  let out = '';
  for (const byte of body) out += String.fromCharCode(byte);
  return out;
}

function isDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39;
}

/** 通告编号里的字符：数字，或剧情 / 自制通告用的大写字母（TVA62、CDAHF）。 */
function isCodeChar(byte: number): boolean {
  return isDigit(byte) || (byte >= 0x41 && byte <= 0x5a);
}

function isCode(text: string): boolean {
  if (text.length !== 5 && text.length !== 6) return false;
  if (!PREFIXES.includes(text.slice(0, 2))) return false;
  const digits = text.slice(2);
  // 剧情 / 自制通告的编号里会带字母（屈原列傳 = TVA62），不能只认纯数字。
  if (!/^[0-9A-Z]{3,4}$/.test(digits)) return false;
  return true;
}

/** Whole days since the epoch; UTC avoids local-timezone DARPA drift. */
export function dayNumber(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** "2006/2/13" -> day number; returns NaN for blank / malformed text. */
export function parseDay(text: string): number {
  const parts = text.split('/').map(Number);
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return NaN;
  return dayNumber(parts[0], parts[1], parts[2]);
}

/** Day number -> "2006/2/12". */
export function dayText(day: number): string {
  const date = new Date(day * 86400000);
  return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

/** 钱按亿 / 万拆开写：12000 → 1万2000，110002000 → 1亿1000万2000，
 *  不到一万原样给（5000 → 5000）。每一段都不再加千分位。 */
export function moneyText(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  let rest = Math.abs(Math.round(value));
  const yi = Math.floor(rest / 100000000);
  rest -= yi * 100000000;
  const wan = Math.floor(rest / 10000);
  rest -= wan * 10000;
  let out = '';
  if (yi) out += `${yi}亿`;
  if (wan) out += `${wan}万`;
  if (rest || !out) out += `${rest}`;
  return sign + out;
}

/** Locate named blocks whose characters are stored one ASCII int32 per char. */
function findInt32Names(
  bytes: Uint8Array,
  view: DataView,
  targets: string[],
): Record<string, [number, number]> {
  const wanted = new Set(targets);
  const words = Math.floor(bytes.length / 4);
  const found: Record<string, [number, number]> = {};
  let i = 0;
  while (i < words) {
    const first = view.getUint32(i * 4, true);
    if (first >= 0x20 && first <= 0x7a) {
      let j = i;
      let text = '';
      while (j < words) {
        const value = view.getUint32(j * 4, true);
        if (value < 0x20 || value > 0x7a) break;
        text += String.fromCharCode(value);
        j += 1;
      }
      if (wanted.has(text) && !(text in found)) found[text] = [i * 4, j * 4];
      i = j;
    } else {
      i += 1;
    }
  }
  return found;
}

/** Scan the Case block for 192-byte role records holding rolled thresholds. */
function parseRoles(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
): RoleRecord[] {
  const rows: RoleRecord[] = [];
  let i = start;
  while (i < end) {
    const prefix = i + 1 < end
      ? String.fromCharCode(bytes[i], bytes[i + 1])
      : '';
    if (!PREFIXES.includes(prefix)) {
      i += 1;
      continue;
    }
    let length = 0;
    while (length < 4 && i + 2 + length < end && isCodeChar(bytes[i + 2 + length])) length += 1;
    if (length < 3) {
      i += 1;
      continue;
    }
    const matched = asciiString(bytes, i, i + 2 + length);
    const off = i - 12;
    const advance = 2 + length;
    i += advance;
    if (off < start || off + 192 > bytes.length) continue;

    const tag = asciiString(bytes, off + 12, off + 20);
    if (tag !== matched || !isCode(tag)) continue;

    const role = big5String(bytes, off + 20, off + 32);
    if (!role || role.length > 8 || /[\x00-\x7f]/.test(role)) continue;

    const star = view.getUint32(off + 32, true);
    const values: Record<string, number> = {};
    let plausible = false;
    for (let j = 0; j < ATTRS.length; j += 1) {
      const value = view.getUint32(off + 40 + 4 * j, true);
      if (value >= 50 && value <= 999) plausible = true;
      if (value) values[ATTRS[j]] = value;
    }
    if (!(star >= 1 && star <= 5) || !plausible) continue;

    // 社交接演门槛紧跟在九项能力之后：off+76 叛逆 / +80 性感 / +84 亲和。
    // 与艺人 social 前三项同量纲（都是几百的直接值，不做 ×10 换算），
    // 全部为 0 表示这个角色没有额外要求。逐一跨 27 份存档核对过槽位。
    const social: SocialThresholds = {
      rebellion: view.getUint32(off + 76, true),
      sexy: view.getUint32(off + 80, true),
      affinity: view.getUint32(off + 84, true),
    };

    rows.push({
      code: tag.slice(0, 5),
      roleCode: tag,
      role,
      gender: roleGender(role),
      star,
      values,
      social,
      requirements: [],
      reservedBy: RESERVED_ROLES[tag] ?? '',
      offset: off,
    });
  }
  return rows;
}

/** CaseFirm: [seq, firmSlot, length, code-as-int32-chars] records. */
function parseCaseFirm(
  view: DataView,
  start: number,
  byteLength: number,
): { seq: number; firm: number; code: string }[] {
  const out: { seq: number; firm: number; code: string }[] = [];
  const firstWord = Math.floor(start / 4) + 1;
  const limit = Math.min(Math.floor(byteLength / 4), Math.floor(start / 4) + 200);
  for (let word = firstWord; word < limit; word += 1) {
    const off = word * 4;
    let chars = '';
    for (let j = 0; j < 5; j += 1) {
      const value = view.getUint32(off + 4 * j, true);
      if (value < 0x20 || value > 0x7a) break;
      chars += String.fromCharCode(value);
    }
    if (chars.length !== 5) continue;
    if (!/^(?:CD|CF|MV|TV|SH)[0-9A-Z]{3}$/.test(chars)) continue;
    const seq = view.getUint32(off - 12, true);
    const firm = view.getUint32(off - 8, true);
    const length = view.getUint32(off - 4, true);
    if (length === 5) out.push({ seq, firm, code: chars });
  }
  return out;
}

function gradeOf(value: number, star: number, difficulty: number[][][]): string {
  const ranges = difficulty[star - 1];
  if (!ranges) return '';
  for (let idx = 0; idx < ranges.length; idx += 1) {
    const [lo, hi] = ranges[idx];
    if (value >= lo && value <= hi) return GRADES[idx + 1] ?? '';
  }
  return '?';
}

function isBig5Pair(first: number, second: number): boolean {
  return first >= 0xa1 && first <= 0xf9 && second >= 0x40 && second <= 0xfe;
}

/** A NUL-terminated Big5 name made only of double-byte characters. */
function readBig5Name(bytes: Uint8Array, off: number, limit = 14): string {
  const buf: number[] = [];
  for (let i = 0; i + 1 < limit; i += 2) {
    const a = bytes[off + i];
    const b = bytes[off + i + 1];
    if (!a || !b || !isBig5Pair(a, b)) break;
    buf.push(a, b);
  }
  if (buf.length < 4) return '';
  return decodeBig5(Uint8Array.from(buf));
}

/** The 284-byte role-name table at the head of the save. Locate its base by
 *  looking for three consecutive Chinese names, then read the whole roster. */
export function parseRoster(bytes: Uint8Array): RosterEntry[] {
  let base = -1;
  for (let o = 0; o < 20000; o += 4) {
    if (readBig5Name(bytes, o) && readBig5Name(bytes, o + 284) && readBig5Name(bytes, o + 568)) {
      base = o;
      break;
    }
  }
  if (base < 0) return [];
  const out: RosterEntry[] = [];
  let blanks = 0;
  for (let k = 0; k < 60; k += 1) {
    const name = readBig5Name(bytes, base + k * 284);
    blanks = name ? 0 : blanks + 1;
    if (blanks >= 3 && out.length > 4) break; // a few empty slots are normal
    out.push({ id: k, name });
  }
  return out;
}

/** 通告角色预约表：Case 段外另有一组 52 字节定长记录
 *  [6][5×int32 ASCII 通告码][int32 ASCII 角色号][接演艺人编号][0×5]。
 *  编号对应存档头部 284 字节名字表每条记录前 8 字节的那个编号，能覆盖
 *  我方艺人与 NPC。只有真被预约/接走的角色才写编号，其余全 0。
 *  有了它就能把预约精确落到角色号，不用再按性别猜第一个同性别角色
 *  （小熊寶寶「女主角 / 女配角」就是那个坑）。 */
function parseRoleReservations(bytes: Uint8Array, view: DataView): Map<string, string> {
  const out = new Map<string, string>();
  let base = -1;
  for (let o = 0; o < 20000 - 568; o += 4) {
    if (readBig5Name(bytes, o) && readBig5Name(bytes, o + 284) && readBig5Name(bytes, o + 568)) {
      base = o;
      break;
    }
  }
  if (base < 8) return out;
  const nameById = new Map<number, string>();
  for (let k = 0; k < 60; k += 1) {
    const at = base + k * 284;
    const id = view.getUint32(at - 8, true);
    const name = readBig5Name(bytes, at);
    if (id > 0 && id < 200 && name && !nameById.has(id)) nameById.set(id, name);
  }
  const limit = bytes.length - 52;
  for (let o = 0; o < limit; o += 4) {
    if (view.getUint32(o, true) !== 6) continue;
    let code = '';
    let valid = true;
    for (let j = 0; j < 5; j += 1) {
      const c = view.getUint32(o + 4 + 4 * j, true);
      if (c < 0x20 || c > 0x7a) { valid = false; break; }
      code += String.fromCharCode(c);
    }
    if (!valid || !/^(?:CD|CF|MV|TV|SH)[0-9A-Z]{3}$/.test(code)) continue;
    const digit = view.getUint32(o + 24, true);
    if (digit < 0x30 || digit > 0x39) continue;
    const artistId = view.getUint32(o + 28, true);
    // 真正的预约记录末尾 5 个 int32 全是 0。扫描时会在别的数据里撞上
    // 形同 [6][CF095][1][16] 的片段（Story0014 的 CF095 就是），它尾部
    // 带一个 1，实际不是接取记录 —— 不校验尾部就会把「没接取」误报成已预约。
    let clean = true;
    for (let k = 32; k < 52; k += 4) {
      if (view.getUint32(o + k, true) !== 0) { clean = false; break; }
    }
    if (!clean) continue;
    const name = artistId ? nameById.get(artistId) : undefined;
    if (!name) continue;
    out.set(`${code}${String.fromCharCode(digit)}`, name);
  }
  return out;
}

/** 头部友好度表：存档头部按 284 字节一条排列，字段为
 *  [友好度 int32][送礼数 int32][256/257][艺人编号 int32]。用编号反查，不依赖固定偏移。
 *  礼物数就在这条记录的第二格；艺人状态块 social 之后那几个 0/1 是标志位，不是数量。 */
function parseFriendship(
  view: DataView,
  bytes: Uint8Array,
): { friendship: Record<number, number>; gifts: Record<number, number> } {
  const friendship: Record<number, number> = {};
  const gifts: Record<number, number> = {};
  const ids = new Set(ARTIST_DIRECTORY.map((a) => a.id));
  const limit = Math.min(bytes.length - 16, 20000);
  for (let p = 0; p + 16 <= limit; p += 4) {
    const value = view.getUint32(p, true);
    if (value > 9999) continue;
    const giftCount = view.getUint32(p + 4, true);
    if (giftCount > 9999) continue;
    const marker = view.getUint32(p + 8, true);
    if (marker !== 256 && marker !== 257) continue;
    const id = view.getUint32(p + 12, true);
    if (!ids.has(id) || id in friendship) continue;
    friendship[id] = value;
    gifts[id] = giftCount;
  }
  return { friendship, gifts };
}

/** 制作人 / 角色档案表：与艺人友好度表分开的一段，每条 284 字节，
 *  `+0` 角色编号（4xx 唱片 / 5xx 电视剧 / 6xx 电影 / 7xx 广告…）、`+4` 类别，
 *  `+8` Big5 繁体名字、`+181` ASCII 项目代号（EAMI_CD / LCTV_Drama…），
 *  `+148` 友好度整数。编号不连续（401/402/404…），所以按编号反查而不是数序号。
 *  锚点用「编号落在 400..799 且类别 === 编号百位」找连续链，不写死绝对偏移——
 *  88 份存档验证过表都从 code=401 那条起、步长 284。
 *  这张表同时混着 NPC 与场景物件（購物袋 / c-佈景1 / 追夢佈景…），名字只收
 *  纯 Big5 双字节串，项目代号排除 NULL 与 Role_* 占位，避免把占位当身份。 */
function parseProducerRecords(
  view: DataView,
  bytes: Uint8Array,
): {
  friendship: Record<number, number>;
  names: Record<number, string>;
  projects: Record<number, string>;
} {
  const friendship: Record<number, number> = {};
  const names: Record<number, string> = {};
  const projects: Record<number, string> = {};
  const limit = Math.min(bytes.length - 152, 200000);

  const readProfile = (q: number, code: number) => {
    const name = readBig5Name(bytes, q + 8, 16);
    if (name && !(code in names)) names[code] = name;
    const project = asciiString(bytes, q + 181, q + 181 + 40);
    if (project && project !== 'NULL' && !project.startsWith('Role_') && !(code in projects)) {
      projects[code] = project;
    }
  };

  // 找 code=401 的那条记录（类别 4），它恒是制作人表第一条。
  for (let p = 0; p + 152 <= limit; p += 4) {
    if (view.getUint32(p, true) !== 401) continue;
    if (view.getUint32(p + 4, true) !== 4) continue;
    const firstFriendship = view.getUint32(p + 148, true);
    if (firstFriendship > 9999) continue;
    // 命中锚点：从这条起按 284 步长读连续记录。
    for (let q = p; q + 152 <= bytes.length; q += 284) {
      const code = view.getUint32(q, true);
      if (code < 400 || code > 799) break;
      const kind = view.getUint32(q + 4, true);
      // 中间夹着未启用的空槽（如 411 kind=0），跳过继续，不能中断整张表。
      if (kind !== Math.floor(code / 100)) continue;
      const value = view.getUint32(q + 148, true);
      if (value > 9999) continue;
      friendship[code] = value;
      readProfile(q, code);
    }
    break;
  }

  // 同一张 284 字节定长表还含 NPC / 其他角色（3 賀總 / 38 史蒂芬 / 39 丹尼斯 /
  // 101 王瑞恩…）与 13xx 段（1301 加賀大澤 / 1302 史麥克）。这些段的 +4 类别
  // 不是编号百位，不能套上面的校验；改用「code=3 且 +284 处 code=4」双连续
  // 锚点定位表头（跨 40+ 份存档 base 712/772 都能命中），再按步长顺扫到
  // code=1399（表尾是 1400+ 的场景物件，友好度恒 0），空槽跳过、先到优先。
  for (let p = 0; p + 432 <= limit; p += 4) {
    if (view.getUint32(p, true) !== 3) continue;
    if (view.getUint32(p + 284, true) !== 4) continue;
    if (view.getUint32(p + 148, true) > 9999) continue;
    for (let q = p; q + 152 <= bytes.length; q += 284) {
      const code = view.getUint32(q, true);
      if (code > 1399) break;
      if (code < 1) continue;
      const value = view.getUint32(q + 148, true);
      if (value > 9999) continue;
      if (!(code in friendship)) friendship[code] = value;
      readProfile(q, code);
    }
    break;
  }
  return { friendship, names, projects };
}

/** Artist attribute blocks: nine abilities, stress/fatigue, a short Big5
 *  status label, the social stats and five notice counters. The 999 "cap"
 *  blocks that follow each real one are filtered out. */
/** 记事表在存档里的位置：表头 `[条数][108]`，随后是条数×108 字节。
 *  全档扫 `条数 / 108` 这两个 int32，再逐条校验年月日与编号范围；88 份存档
 *  上验证过每份只会命中一处（记事表出现前也返回 null，不是解析失败）。 */
function readDiaryTable(
  view: DataView, byteLength: number,
): { offset: number; count: number } | null {
  let best: { offset: number; count: number } | null = null;
  for (let offset = 0; offset + 16 <= byteLength; offset += 4) {
    const count = view.getInt32(offset, true);
    if (count < 1 || count > 400) continue;
    if (view.getInt32(offset + 4, true) !== DIARY_STRIDE) continue;
    if (offset + 8 + count * DIARY_STRIDE > byteLength) continue;
    let ok = true;
    for (let i = 0; i < count && ok; i += 1) {
      const p = offset + 8 + i * DIARY_STRIDE;
      const year = view.getUint32(p, true);
      const month = view.getUint32(p + 4, true);
      const day = view.getUint32(p + 8, true);
      const kind = view.getUint32(p + 12, true);
      const thing = view.getUint32(p + 16, true);
      const artist = view.getUint32(p + 20, true);
      ok = year >= 2000 && year <= 2100 && month >= 1 && month <= 12
        && day >= 1 && day <= 31 && kind <= 40 && thing <= 99 && artist <= 200;
    }
    if (!ok) continue;
    if (!best || count > best.count) best = { offset, count };
  }
  return best;
}

/** 记事里的作品编码：`+56` 起 8 字节 ASCII，`CF159` 这样。 */
function readDiaryCode(view: DataView, offset: number): string {
  let code = '';
  for (let j = 0; j < 8; j += 1) {
    const v = view.getUint8(offset + j);
    if (!v) break;
    if (v < 0x20 || v > 0x7e) return '';
    code += String.fromCharCode(v);
  }
  return /^[A-Z]{2}[0-9A-Z]{3}$/.test(code) ? code : '';
}

/** 解析「艺人成绩」记事里的获奖记录，最近的排在最前。
 *  一条记录 = 年 / 月 / 日 / 事件类型 / 事项编号 / 艺人编号 / 作品编码。
 *  只认事件类型 5 且事项编号 21..53 的；作品名去静态通告表查。 */
export function parseAwards(
  view: DataView, byteLength: number, cases: CaseTables['cases'],
): ArtistAward[] {
  const table = readDiaryTable(view, byteLength);
  if (!table) return [];
  const rows: { award: ArtistAward; day: number }[] = [];
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * DIARY_STRIDE;
    const kind = view.getUint32(p + 12, true);
    if (kind !== DIARY_AWARD_KIND) continue;
    const awardId = view.getUint32(p + 16, true);
    const label = AWARD_NAMES[awardId];
    if (!label) continue;
    const year = view.getUint32(p, true);
    const month = view.getUint32(p + 4, true);
    const day = view.getUint32(p + 8, true);
    const workCode = readDiaryCode(view, p + 56);
    rows.push({
      award: {
        year, month,
        date: `${year}/${month}`,
        ceremony: AWARD_CEREMONY[Math.floor(awardId / 10)] ?? '',
        label,
        awardId,
        workCode,
        workName: (workCode && cases[workCode]?.[0]) || workCode || '作品未记录',
        company: COMPANY_AWARD_IDS.includes(awardId),
        group: GROUP_AWARD_IDS.includes(awardId),
        artistId: view.getUint32(p + 20, true),
      },
      day: dayNumber(year, month, day),
    });
  }
  rows.sort((a, b) => b.day - a.day || a.award.awardId - b.award.awardId);
  return rows.map((row) => row.award);
}

/** 解析「艺人成绩」记事里的团体唱片发行记录，按时间正序（早 -> 晚）。
 *  判定：事项 13 = 唱片作品，编码 CD 开头，静态表 subtype = 團體，且排除奖项(kind 5)。
 *  同一编码去重（获奖等事件会重复记同一张）。 */
export function parseGroupWorks(
  view: DataView, byteLength: number, cases: CaseTables['cases'],
): GroupWork[] {
  const table = readDiaryTable(view, byteLength);
  if (!table) return [];
  const seen = new Set<string>();
  const rows: { work: GroupWork; day: number }[] = [];
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * DIARY_STRIDE;
    // 不能按 kind 跳过 5：获奖类型里也混着「事项 13 = 唱片发行」的真实发行记录
    // （如 CD106 算了吧、CD838 春夏秋冬），跳过就少算团体唱片。
    if (view.getUint32(p + 16, true) !== 13) continue;
    const workCode = readDiaryCode(view, p + 56);
    if (!workCode.startsWith('CD') || cases[workCode]?.[2] !== '團體') continue;
    if (seen.has(workCode)) continue;
    seen.add(workCode);
    const year = view.getUint32(p, true);
    const month = view.getUint32(p + 4, true);
    const day = view.getUint32(p + 8, true);
    rows.push({
      work: {
        date: `${year}/${month}/${day}`,
        year, month, day,
        workCode,
        workName: cases[workCode]?.[0] || workCode,
        company: cases[workCode]?.[3] || '',
        // `+20` 是当次挂名艺人，`+24` 才是团体代表；换过成员的团可能分属不同团。
        artistId: view.getUint32(p + 24, true),
      },
      day: dayNumber(year, month, day),
    });
  }
  rows.sort((a, b) => a.day - b.day || a.work.workCode.localeCompare(b.work.workCode));
  return rows.map((row) => row.work);
}

/** 存档「通告记录表」：一段变长记录（每条约 1100~1200 字节，长度随公司名
 *  Big5 字节数浮动），每条起点是 ASCII 通告码，+892 起是五组 [年,月,日,周]
 *  档期（开放接取 / 开拍 / 杀青 / 上档 / 下档），+792 起是角色接演槽位，
 *  +800 / +824 是两位签约艺人的 roleId。
 *
 *  记录起点锚点：ASCII 合法通告码 + `+892` 是 2000~2015 的年份 + 五组档期
 *  月日均合法。跨多份存档验证过不会命中角色定义表（那条是 192B 固定记录，
 *  +892 处不是年份）。
 *
 *  七类状态口径（对照游戏存档编辑器「通告列表」下拉）：
 *  - 宣传活动：作品本体衍生出的宣传/首映/MV/签名会活动，角色类型是
 *    「個人 / 團體」。判定靠记录内嵌的类型码锚点（见下），不靠同码多条。
 *    类型码 10=電視劇宣傳 15=電影宣傳 16=首映會 20=唱片宣傳 21=拍攝MV
 *    22=簽名會（data1/ScheduleClass.dat + 存档编辑器截图双向确认）。
 *  - 筹备中 / 拍摄中 / 等待上市 / 热卖中 / 已完成：按当前日期落在五组档期
 *    的哪一段推算。作品本体走正常档期分类。
 *
 *  宣传活动锚点：记录内 `[5×ASCII 通告码][类型码 int32][天数 int32]`，
 *  类型码 ∈ {10,15,16,20,21,22}、天数 20~40；锚点后面 28~220 字节内是
 *  同一通告码的记录起点（可含 base892 个人或 base940 团体）。角色槽首格
 *  「個人 / 團體」区分主体：个人艺人号在 +800、完成天数 +804；团体编号
 *  在 +832、完成天数 +836（+804 是哨兵值）。story17/story70/AutoReleased
 *  三档共 79 条宣传记录全部命中。 */
export function parseArchiveNotices(
  bytes: Uint8Array,
  view: DataView,
  tables: CaseTables,
  currentDate: GameDate | null,
): ArchiveNotice[] {
  const today = currentDate?.dayNumber ?? NaN;
  const day = (y: number, m: number, d: number) => dayNumber(y, m, d);
  const b = bytes;
  const PREFIX = new Set(['TV', 'MV', 'CD', 'CF', 'SH']);
  const isAsciiCode = (o: number): string => {
    if (o < 0 || b[o] < 0x41 || b[o] > 0x5a) return '';
    let s = '';
    for (let j = 0; j < 5; j += 1) {
      const c = b[j + o];
      if (c < 0x30 || c > 0x7a) return '';
      s += String.fromCharCode(c);
    }
    return PREFIX.has(s.slice(0, 2)) && /^[0-9A-Z]{3}$/.test(s.slice(2)) ? s : '';
  };
  const q = (o: number, r: number) => view.getUint32(o + r, true);
  const roleAt = (o: number, r: number): string => {
    try {
      return decodeBig5(b.slice(o + r, o + r + 16)).replace(/\0.*/, '').replace(/[^\u4e00-\u9fff]/g, '');
    } catch {
      return '';
    }
  };

  // 类型码 -> 宣传子类（data1/ScheduleClass.dat + 存档编辑器截图双向确认）。
  const PROMO_KIND: Record<number, PromoKind> = {
    10: '電視劇宣傳',
    15: '電影宣傳',
    16: '首映會',
    20: '唱片宣傳',
    21: '拍攝MV',
    22: '簽名會',
  };

  // 阶段一：收集所有合法通告记录起点（ASCII 码 + 年份 + 五组档期合法）。
  // 个人记录年份在 +892，团体记录在 +940，两者都要收。
  type Rec = {
    o: number;
    code: string;
    start: number;
    end: number;
    onSale: number;
    off: number;
    startDate: string;
    endDate: string;
    saleStart: string;
    saleEnd: string;
    pay: number | null;
    otherInfo: string;
    artists: number[];
    groupId: number;
    doneDays: number | null;
    isGroup: boolean;
    casts: PromoCast[];
  };
  // 读宣传记录里每个角色槽：个人每槽 +800+i*24 艺人 / +804+i*24 天数 / +10+i*192 角色名；
  // 团体记录只有一条，团体 code +772、代表艺人 +832、完成天数 +836。
  const readCasts = (o: number, group: boolean, slot = 0, code = ''): PromoCast[] => {
    if (group) {
      return [{ roleName: '團體', artistId: q(o, 832), doneDays: q(o, 836), groupCode: q(o, 772) }];
    }
    const out: PromoCast[] = [];
    for (let i = 0; i < 4; i += 1) {
      const artistId = q(o, 800 + slot + i * 24);
      const roleName = roleAt(o, 10 + i * 192);
      if (!artistId && !roleName) continue;
      out.push({
        roleName: roleName || '個人', artistId, doneDays: q(o, 804 + slot + i * 24),
        groupCode: 0, pay: q(o, 816 + slot + i * 24), roleCode: `${code}${i + 1}`,
      });
    }
    return out;
  };
  const recs: Rec[] = [];
  const recByOffset = new Map<number, Rec>();
  for (let o = 0; o + 1080 < b.length; o += 1) {
    const code = isAsciiCode(o);
    if (!code) continue;
    const y892 = q(o, 892);
    const y940 = q(o, 940);
    const stdPersonal = y892 >= 2000 && y892 <= 2015;
    const stdGroup = !stdPersonal && y940 >= 2000 && y940 <= 2015;
    // CF 广告记录的档期锚点会整体后移：+908（艺人 +816，5 组档期）或
    // +956（艺人 +816，2 组档期，无开拍/杀青），标准 +892 不合法。
    // 这类记录的 +940 也可能是合法年份（和团体式布局重叠），所以用「+816 是合法艺人编号」
    // 来确认是后移布局；否则退回标准判定。只在 CF 广告时探测，避免误伤 TV/CD/MV。
    let cfExtra = 0;
    if (!stdPersonal && code.startsWith('CF')) {
      const artist816 = q(o, 816);
      if (artist816 >= 1 && artist816 <= 100) {
        for (const cand of [908, 956]) {
          const y = q(o, cand);
          const m = q(o, cand + 4);
          const d = q(o, cand + 8);
          if (y >= 2000 && y <= 2015 && m >= 1 && m <= 12 && d >= 1 && d <= 31) { cfExtra = cand; break; }
        }
      }
    }
    const isGroup = !cfExtra && stdGroup;
    if (!isGroup && !stdPersonal && !cfExtra) continue;
    // 扩展锚点的 CF 记录：艺人/完成/酬劳在 +816/+820/+832（相对标准 +800 后移 16）。
    const base = cfExtra ? cfExtra : isGroup ? 940 : 892;
    const role1 = roleAt(o, 10);
    const group = role1 === '團體';
    // CF 广告个人通告用「团体式布局」但角色首格不是「團體」：档期从 +940 起，
    // 角色槽整体比标准个人记录晚 32B（艺人 +832 / 完成 +836 / 酬劳 +848）。
    // 用 +832 是否为合法艺人编号来区分，避免把角色定义表的 0 当成艺人。
    const cfPersonal = isGroup && !group && q(o, 832) >= 1 && q(o, 832) <= 100;
    const slot = cfExtra ? 16 : cfPersonal ? 32 : 0;
    // CF501 这类锚点 +956 的记录只有 2 组档期（上档/下档），没有开拍/杀青组。
    const cfShort = cfExtra === 956;
    const months = [q(o, base + 4), q(o, base + 20), q(o, base + 36), q(o, base + 52), q(o, base + 68)];
    const days = [q(o, base + 8), q(o, base + 24), q(o, base + 40), q(o, base + 56), q(o, base + 72)];
    const valid = (i: number) => months[i] >= 1 && months[i] <= 12 && days[i] >= 1 && days[i] <= 31;
    // 个人记录档期组：[开放, 开拍, 杀青, 上档, 下档]；开拍在 base+16、杀青 base+32。
    // 团体记录（含 CF 广告这种团体式布局）从 base 起就是开拍、base+16 杀青。
    const earlyStart = group || cfPersonal;
    const startBase = earlyStart ? base : base + 16;
    const endBase = earlyStart ? base + 16 : base + 32;
    const startIdx = earlyStart ? 0 : 1;
    const endIdx = earlyStart ? 1 : 2;
    if (cfShort ? (!valid(0) || !valid(1)) : (!valid(startIdx) || !valid(endIdx))) continue;
    // 短布局没有开拍/杀青，起止日用上档/下档；UI 里拍摄档期显示「—」由空文本表达。
    const start = cfShort ? day(q(o, base), months[0], days[0]) : day(q(o, startBase), months[startIdx], days[startIdx]);
    const end = cfShort ? day(q(o, base + 16), months[1], days[1]) : day(q(o, endBase), months[endIdx], days[endIdx]);
    const groupId = group ? q(o, 772) : 0;
    const doneRaw = group ? q(o, 836) : q(o, 804 + slot);
    const doneDays = doneRaw < 4000000000 ? doneRaw : null;
    // 角色槽最多 4 个（MV142 的接演人就写在 +848 / +872），只读前两位会漏人。
    const artists = group ? [] : [...new Set(
      Array.from({ length: 4 }, (_, i) => q(o, 800 + slot + i * 24)).filter((a) => a >= 1 && a <= 100),
    )];
    const rec: Rec = {
      o,
      code,
      start,
      end,
      // 上档/下档：个人在 months[3]/[4]，团体少一组、在 months[2]/[3]。
      // cfShort 只有 2 组档期：上档 base、下档 base+16。
      onSale: cfShort ? day(q(o, base), months[0], days[0])
        : day(q(o, earlyStart ? base + 32 : base + 48), months[earlyStart ? 2 : 3], days[earlyStart ? 2 : 3]),
      off: cfShort ? day(q(o, base + 16), months[1], days[1])
        : day(q(o, earlyStart ? base + 48 : base + 64), months[earlyStart ? 3 : 4], days[earlyStart ? 3 : 4]),
      startDate: cfShort ? '' : fmtDay(view, o + startBase),
      endDate: cfShort ? '' : fmtDay(view, o + endBase),
      // 个人记录 5 组档期（+892 起）：开拍 +908 / 杀青 +924 / 上档 +940 / 下档 +956。
      // 团体式布局 4 组（+924 开放周、+940 开拍起）：上档 +972 / 下档 +988。
      // cfShort 2 组：上档 base / 下档 base+16。
      saleStart: fmtDay(view, o + (cfShort ? base : isGroup ? base + 32 : base + 48)),
      saleEnd: fmtDay(view, o + (cfShort ? base + 16 : isGroup ? base + 48 : base + 64)),
      pay: q(o, 816 + slot) < 4000000000 ? q(o, 816 + slot) : null,
      // 编辑器「其他信息」头六个数：个人档期在 +892~+963，紧接 +972；
      // 团体/CF 档期在 +924~+999，紧接 +1004；cfShort 2 组档期后紧接 base+32。
      otherInfo: Array.from({ length: 6 }, (_, i) => {
        const infoBase = cfShort ? base + 32 : base + (isGroup ? 64 : 80);
        const x = q(o, infoBase + i * 4);
        return x < 4000000000 ? x : 0;
      }).join(', '),
      artists,
      groupId,
      doneDays,
      isGroup: group,
      casts: readCasts(o, group, slot, code),
    };
    recs.push(rec);
    recByOffset.set(o, rec);
  }
  recs.sort((a, z) => a.o - z.o);

  // 阶段二：扫类型码锚点 `[5×ASCII 通告码][类型码][天数]`，关联到后面同码的记录起点。
  // 锚点后 28~220 字节内找同一 code 的起点；找到后若阶段一没收（年份字段是 0 的
  // 唱片宣传记录），就在此就地构造一条宣传 Rec，保证这类也能出现在清单里。
  const promoByOffset = new Map<number, PromoKind>();
  for (let p = 0; p + 28 < b.length; p += 4) {
    // 锚点里 5 个 ASCII 字符各占一个 int32（4 字节），低位是字符；逐 int32 读。
    let ascii = '';
    let codeOk = true;
    for (let j = 0; j < 5; j += 1) {
      const v = view.getUint32(p + j * 4, true);
      if (v > 0xff || v < 0x30 || v > 0x7a) { codeOk = false; break; }
      ascii += String.fromCharCode(v);
    }
    if (!codeOk) continue;
    if (!PREFIX.has(ascii.slice(0, 2)) || !/^[0-9A-Z]{3}$/.test(ascii.slice(2))) continue;
    const kind = PROMO_KIND[view.getUint32(p + 20, true)];
    const promoDays = view.getUint32(p + 24, true);
    if (!kind || promoDays < 20 || promoDays > 40) continue;
    for (let s = p + 28; s <= p + 220; s += 1) {
      if (isAsciiCode(s) !== ascii) continue;
      if (promoByOffset.has(s)) break;
      promoByOffset.set(s, kind);
      if (!recByOffset.has(s)) {
        // 部分唱片宣传记录的年份字段是 0，阶段一漏掉。档期三元组从起点往后
        // 860~1000 范围找第一组「年 2000~2015 + 合法月日」，据此定 base。
        let base = -1;
        for (let r = 860; r <= 1000; r += 4) {
          const yy = q(s, r);
          const mm = q(s, r + 4);
          const dd = q(s, r + 8);
          if (yy >= 2000 && yy <= 2015 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) { base = r; break; }
        }
        if (base >= 0) {
          const role1 = roleAt(s, 10);
          const group = role1 === '團體';
          const doneRaw = group ? q(s, 836) : q(s, 804);
          const rec: Rec = {
            o: s,
            code: ascii,
            start: day(q(s, base), q(s, base + 4), q(s, base + 8)),
            end: day(q(s, base + 16), q(s, base + 20), q(s, base + 24)),
            onSale: 0,
            off: 0,
            startDate: fmtDay(view, s + base),
            endDate: fmtDay(view, s + base + 16),
            saleStart: '',
            saleEnd: '',
            pay: null,
            otherInfo: '',
            artists: group ? [] : [...new Set(
              Array.from({ length: 4 }, (_, i) => q(s, 800 + i * 24)).filter((a) => a >= 1 && a <= 100),
            )],
            groupId: group ? q(s, 772) : 0,
            doneDays: doneRaw < 4000000000 ? doneRaw : null,
            isGroup: group,
            casts: readCasts(s, group, 0, ascii),
          };
          // 这段是宣传记录的起始段（在通告记录表尾部），插到末尾即可。
          recs.push(rec);
          recByOffset.set(s, rec);
        }
      }
      break;
    }
  }

  // 阶段三：组装。宣传活动的档期/艺人/天数来自关联的记录本体；其余按档期分状态。
  const out: ArchiveNotice[] = [];
  for (const rec of recs) {
    const promoKind = promoByOffset.get(rec.o);
    let category: ArchiveNoticeCategory;
    if (promoKind) {
      category = '宣傳活動';
    } else if (!Number.isFinite(today)) {
      category = '已完成';
    } else if (today < rec.start) {
      category = '籌備中';
    } else if (today <= rec.end) {
      category = '拍攝中';
    } else {
      category = today < rec.onSale ? '等待上市' : today <= rec.off ? '熱賣中' : '已完成';
    }
    const notice: ArchiveNotice = {
      code: rec.code,
      name: tables.cases[rec.code]?.[0] || rec.code,
      category,
      startDate: rec.startDate,
      endDate: rec.endDate,
      artistIds: rec.artists,
      castSlots: rec.casts,
    };
    if (promoKind) {
      notice.promoKind = promoKind;
      notice.doneDays = rec.doneDays;
      if (rec.isGroup) notice.groupId = rec.groupId;
      notice.promoCasts = rec.casts;
      notice.endDayNum = rec.end;
    } else if (category === '等待上市' || category === '熱賣中' || category === '已完成') {
      // 等待上市 / 热卖中 / 已完成显示的是本体记录：发行档期 + 每个参演角色的完成天数 / 酬劳。
      notice.saleStart = rec.saleStart;
      notice.saleEnd = rec.saleEnd;
      notice.pay = rec.pay;
      notice.otherInfo = rec.otherInfo;
      notice.promoCasts = rec.casts;
    }
    out.push(notice);
  }
  return out;
}

/** 从记录起点 +r 读一个 [年,月,日] 三元组，格式化成 2006/7/31。 */
function fmtDay(view: DataView, p: number): string {
  return `${view.getUint32(p, true)}/${view.getUint32(p + 4, true)}/${view.getUint32(p + 8, true)}`;
}

/** 截图逐条核对过的角色归属。记事表二进制本身不存角色名，游戏是按接演时的
 *  角色分配在界面上现算的；这些是用户实机截图确认过的例外，其余按角色表的
 *  星级（主角优先）+ 艺人性别挑。 */
const WORK_ROLE_OVERRIDES: Record<string, string> = {
  '8|TV111': '男配角',
  '8|MV706': '男配角',
  // 笑傲天际只有男主角 / 男配角两格，两位参演者按用户实机核实，不按星级猜。
  '8|MV601': '男主角',
  '14|MV601': '男配角',
  '8|TV727': '男主角',
  '74|MV702': '女主角',
  '74|MV009': '女主角',
  '74|TV727': '女主角',
  '74|MV040': '女主角',
  '6|MV153': '女主角',
  // 萧依莉前四部电影按玩家实机「艺人成绩」全是女配角；角色表星级会把她误判成女主角。
  '6|MV013': '女配角',
  '6|MV701': '女配角',
  '6|MV093': '女配角',
  '6|MV009': '女配角',
};

/** 主持通告的角色就在静态表的 subtype 里（助理主持 / 外景主持 / 主持人，
 *  SHCase.dat 的字段，Length.tab 也用同一套叫法），不是从性别猜出来的。 */
const HOST_ROLES = new Set(['助理主持', '外景主持', '主持人']);

/** 电视 / 电影按艺人性别过滤角色表再优先主角；主持直接读通告表的角色字段。 */
function pickWorkRole(
  workCode: string,
  noticeIndex: number,
  artistId: number,
  rolesByCode: Map<string, RoleRecord[]>,
  stars: CaseTables['stars'],
  cases: CaseTables['cases'],
): string {
  if (noticeIndex === 4) return HOST_ROLES.has(cases[workCode]?.[2] ?? '') ? cases[workCode][2] : '';
  if (noticeIndex !== 0 && noticeIndex !== 1) return '';
  const override = WORK_ROLE_OVERRIDES[`${artistId}|${workCode}`];
  if (override) return override;
  const gender = starGender(artistId, stars);
  const candidates = (rolesByCode.get(workCode) ?? []).filter((role) =>
    role.gender === 'any' || gender === 'any' || role.gender === gender);
  if (!candidates.length) return '';
  candidates.sort((a, b) => b.star - a.star || a.roleCode.localeCompare(b.roleCode));
  return candidates[0].role;
}

/** 「艺人成绩」记事里的个人作品发行记录，按时间正序（早 -> 晚）。
 *  团体唱片归团体卡（官方个人唱片统计也不含它），原声带算个人唱片。 */
export function parseWorks(
  view: DataView,
  byteLength: number,
  cases: CaseTables['cases'],
): WorkRecord[] {
  const table = readDiaryTable(view, byteLength);
  if (!table) return [];
  const seen = new Set<string>();
  const rows: { work: WorkRecord; day: number }[] = [];
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * DIARY_STRIDE;
    if (view.getUint32(p + 12, true) === DIARY_AWARD_KIND) continue;
    const noticeIndex = DIARY_WORK_TYPE[view.getUint32(p + 16, true)];
    if (noticeIndex === undefined) continue;
    const workCode = readDiaryCode(view, p + 56);
    if (!workCode.startsWith(WORK_CODE_PREFIX[noticeIndex])) continue;
    if (noticeIndex === 2 && cases[workCode]?.[2] === '團體') continue;
    const artistId = view.getUint32(p + 20, true);
    const key = `${noticeIndex}|${workCode}|${artistId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const year = view.getUint32(p, true);
    const month = view.getUint32(p + 4, true);
    const day = view.getUint32(p + 8, true);
    rows.push({
      work: {
        date: `${year}/${month}/${day}`,
        year, month, day,
        workCode,
        workName: cases[workCode]?.[0] || workCode,
        company: cases[workCode]?.[3] || '',
        artistId,
        noticeIndex,
        role: '',
      },
      day: dayNumber(year, month, day),
    });
  }
  rows.sort((a, b) => a.day - b.day || a.work.workCode.localeCompare(b.work.workCode));
  return rows.map((row, index) => ({ ...row.work, order: index }));
}

/** 作品编码在每个艺人状态块后面，用 5 个小端 int32（ASCII）存 5 个字符。 */
function readHistoryCode(view: DataView, at: number): string {
  let code = '';
  for (let j = 0; j < 5; j += 1) {
    const c = view.getUint32(at + 4 * j, true);
    if (c < 0x20 || c > 0x7a) return '';
    code += String.fromCharCode(c);
  }
  if (!/^(?:CD|CF|MV|TV|SH)[0-9A-Z]{3}$/.test(code)) return '';
  return code;
}

/** 从整张「艺人成绩」记事表建「作品编码 -> 发行日期」索引，给参与清单补日期。
 *
 *  记事表每条的 +56 是作品编码、+0/+4/+8 是年月日。作品的发行月份对同一部
 *  片子是固定的，跟这条记录挂在哪位艺人名下无关（一部多人参与的戏往往只记
 *  在其中一人名下），所以纯按编码索引，不能按艺人分组，否则苏嫚君的 TV046
 *  就会因为记事表里记的是 artist 8 而补不到。同一编码取**最早**的一条
 *  （发行在下档 / 获奖记录之前，如 CD601 取 2008/7/31 而非获奖的 8/29）。
 *
 *  这里必须扫全表，不能用 parseWorks 的结果：后者为了区分发行 / 获奖把
 *  kind=5 整类跳过了，而 kind=5 里其实混着 thing 11..15 的发行记录
 *  （TV151 2007/8/31、MV706 2007/11/30、CF148 2007/6/1、SH088 2006/6/30
 *  等），跳掉就会把这些片子的日期全丢掉。 */
function buildWorkDateIndex(
  view: DataView, byteLength: number,
): {
  dates: Map<string, { date: string; year: number; month: number; day: number }>;
  /** `艺人编号|通告分类` -> `编码 -> 第N部序号`（记事表 +36）。 */
  seqs: Map<string, Map<string, number>>;
} {
  const table = readDiaryTable(view, byteLength);
  const dates = new Map<string, { date: string; year: number; month: number; day: number }>();
  const seqs = new Map<string, Map<string, number>>();
  if (!table) return { dates, seqs };
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * DIARY_STRIDE;
    const code = readDiaryCode(view, p + 56);
    if (!code) continue;
    const year = view.getUint32(p, true);
    const month = view.getUint32(p + 4, true);
    const day = view.getUint32(p + 8, true);
    const prev = dates.get(code);
    if (!prev || dayNumber(year, month, day) < dayNumber(prev.year, prev.month, prev.day)) {
      dates.set(code, { date: `${year}/${month}/${day}`, year, month, day });
    }
    // +36 是游戏内「第 N 部」序号，只在作品发行记录（事项 11..15）里有效。
    // 同一部戏挂不同艺人名下时序号各自独立，所以按 艺人|分类 分组。
    const thing = view.getUint32(p + 16, true);
    const noticeIndex = DIARY_WORK_TYPE[thing];
    const seq = view.getUint32(p + 36, true);
    if (noticeIndex === undefined || seq < 1 || seq > 999) continue;
    const artistId = view.getUint32(p + 20, true);
    const groupKey = `${artistId}|${noticeIndex}`;
    const byCode = seqs.get(groupKey) ?? new Map<string, number>();
    if (!byCode.has(code)) byCode.set(code, seq);
    seqs.set(groupKey, byCode);
  }
  return { dates, seqs };
}

/** 每位艺人状态块后面都跟着一份**完整**的参与记录清单（记事表只有 97 条、
 *  早期的会被挤掉，不能用它当明细）。结构跟 CaseCreate 一样：
 *  `[条数][5]` + 每条 28 字节 `[编码 5×int32][类别][5]`。类别 1/2/3/4/5
 *  分别是 广告/电视/电影/唱片/主持，10/15/16/20/21/22 是同一作品的别的
 *  版本（重播、团体版、原声带等），去重时只取主类别第一条。
 *
 *  这里就是「通告统计 N」的明细真源：苏嫚君官方 8 部电视，记事表只剩 5 条，
 *  参与清单 8 条一条不少；萧依莉 2/6/1/7/5 也逐项对上。团体唱片和原声带
 *  不进个人唱片数，未杀青的自制通告（TV702 二見鍾情）也不算完成作品。
 *  清单本身没有日期，从整张记事表按编码补（见 buildWorkDateIndex）；被挤掉
 *  的早期记录补不到就留空，不猜时间。 */
/** 通告记录表里「作品编码|艺人编号」→ 真实角色名（男/女主角/配角）。
 *  通告本体记录的角色槽是存档真源，比性别+星级猜测可靠；但通告表只留近期
 *  通告，老作品命中不到时仍走 WORK_ROLE_OVERRIDES + 角色表猜测兜底。 */
export type WorkRoleIndex = Map<string, string>;

/** 电视/电影角色槽只认这四种，排除「個人 / 團體 / 女性 / 男性」等占位名。 */
const MAIN_ROLES = new Set(['男主角', '女主角', '男配角', '女配角']);

/** 从通告记录表建角色真源索引；同一作品同一艺人只留第一个（多版本角色应一致）。 */
export function buildWorkRoleIndex(notices: ArchiveNotice[]): WorkRoleIndex {
  const index: WorkRoleIndex = new Map();
  for (const notice of notices) {
    // 筹备中的通告还没有 promoCasts，但角色槽里已经写好了接演人（MV142）。
    for (const cast of notice.castSlots ?? notice.promoCasts ?? []) {
      if (!MAIN_ROLES.has(cast.roleName) || !cast.artistId || cast.artistId > 100) continue;
      const key = `${notice.code}|${cast.artistId}`;
      if (!index.has(key)) index.set(key, cast.roleName);
    }
  }
  return index;
}

export function parseWorkHistory(
  view: DataView,
  artists: ArtistStats[],
  cases: CaseTables['cases'],
  workIndex: ReturnType<typeof buildWorkDateIndex>,
  selfMade: SelfMadeNotice[],
  firmStart: number,
  rolesByCode: Map<string, RoleRecord[]>,
  stars: CaseTables['stars'],
  roleIndex: WorkRoleIndex,
): WorkRecord[] {
  const sorted = [...artists].sort((a, b) => a.offset - b.offset);
  const unfinished = new Set(selfMade.filter((s) => s.status !== 'done').map((s) => s.code));
  const out: WorkRecord[] = [];

  for (let ai = 0; ai < sorted.length; ai += 1) {
    const artist = sorted[ai];
    const stop = ai + 1 < sorted.length ? sorted[ai + 1].offset : firmStart;
    let head = -1;
    for (let o = artist.offset + 348; o + 8 < stop; o += 4) {
      const count = view.getUint32(o, true);
      if (count < 1 || count > 200 || view.getUint32(o + 4, true) !== 5) continue;
      if (!readHistoryCode(view, o + 8)) continue;
      head = o;
      break;
    }
    if (head < 0) continue;
    const count = view.getUint32(head, true);
    const seen = new Set<string>();
    for (let k = 0; k < count; k += 1) {
      const at = head + 8 + k * 28;
      const workCode = readHistoryCode(view, at);
      if (!workCode) break;
      const category = view.getUint32(at + 20, true);
      if (category < 1 || category > 5) continue; // 变体记录，主类别已经收录
      if (unfinished.has(workCode)) continue;
      const noticeIndex = WORK_CODE_PREFIX.indexOf(workCode.slice(0, 2));
      if (noticeIndex < 0 || noticeIndex > 4) continue;
      if (noticeIndex === 2) {
        const info = cases[workCode];
        const subtype = info?.[2] ?? '';
        // 团体唱片不进个人统计。**原声带算个人唱片**：新名紗雪 CD211
        // 《來自深海的愛》是原声带，游戏「艺人成绩」算进 7 张唱片里。
        if (subtype === '團體') continue;
        // 名字含 U+FFFD 是烘焙静态表时 Big5 解不出来的损坏编码（CD661
        // 「LOVE? AGENCY」），游戏里不存在这张，排除它才不会顶替真作品。
        if (info?.[0]?.includes('\ufffd')) continue;
      }
      const key = `${noticeIndex}|${workCode}|${artist.roleId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dated = workIndex.dates.get(workCode);
      const seq = workIndex.seqs.get(`${artist.roleId}|${noticeIndex}`)?.get(workCode);
      out.push({
        date: dated?.date ?? '',
        year: dated?.year ?? 0,
        month: dated?.month ?? 0,
        day: dated?.day ?? 0,
        workCode,
        workName: cases[workCode]?.[0] || workCode,
        company: cases[workCode]?.[3] || '',
        artistId: artist.roleId,
        noticeIndex,
        // 通告记录表角色槽是真源，命中即用；早期作品通告表没留存，回退到
        // 人工核对过的 override + 角色表星级/性别猜测。
        role: roleIndex.get(`${workCode}|${artist.roleId}`)
          ?? pickWorkRole(workCode, noticeIndex, artist.roleId, rolesByCode, stars, cases),
        order: k,
        seq,
      });
    }
  }
  return out;
}

/** 「艺人成绩」记事里的举办活动，按时间正序。
 *  规模取 +36，团体场看 +24 是否非零（Auto 的千金小姐大型团体演唱会 +24=4）。
 *  只认 kind=6 且事项在 61..63，避免把普通通告完成记录混进来。 */
export function parseEvents(view: DataView, byteLength: number): ArtistEvent[] {
  const table = readDiaryTable(view, byteLength);
  if (!table) return [];
  const seen = new Set<string>();
  const rows: { event: ArtistEvent; day: number }[] = [];
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * DIARY_STRIDE;
    if (view.getUint32(p + 12, true) !== 6) continue;
    const kind = view.getUint32(p + 16, true);
    const name = DIARY_EVENT_NAME[kind];
    if (!name) continue;
    const scale = view.getUint32(p + 36, true);
    if (scale < 1 || scale > 3) continue;
    const year = view.getUint32(p, true);
    const month = view.getUint32(p + 4, true);
    const day = view.getUint32(p + 8, true);
    const artistId = view.getUint32(p + 20, true);
    const group = view.getUint32(p + 24, true) > 0;
    const key = `${year}/${month}/${day}|${kind}|${scale}|${group}|${artistId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      event: {
        date: `${year}/${month}/${day}`,
        year, month, day,
        label: `${DIARY_EVENT_SCALE[scale]}${group ? '團體' : kind === 63 ? '個人' : ''}${name}`,
        kind, scale, group, artistId,
      },
      day: dayNumber(year, month, day),
    });
  }
  rows.sort((a, b) => a.day - b.day || a.event.artistId - b.event.artistId);
  return rows.map((row) => row.event);
}

function parseArtists(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  friendship: Record<number, number>,
  giftCounts: Record<number, number>,
  titles: Record<string, string>,
  titleMeta: Record<string, TitleMeta>,
): ArtistStats[] {
  const out: ArtistStats[] = [];
  const seen = new Set<number>();
  let index = 0;
  for (let o = Math.max(0, start); o + 140 <= Math.min(end, bytes.length); o += 4) {
    const rawAbilities = Array.from({ length: 9 }, (_, j) => view.getUint32(o + 4 * j, true));
    // Abilities are stored ×10. 9999 is a legitimate value (the UI shows 999.9),
    // which is why the ceiling has to sit above 9990 — otherwise late-game
    // saves whose artists are near the cap drop out completely.
    if (!rawAbilities.every((v) => v > 100 && v <= 12000)) continue;
    // The save stores every ability ×10 (the in-game UI hides the decimal), so a
    // four-digit value like 1886 is really 188.6. Divide back to the displayed
    // scale before comparing with the three-digit notice requirements.
    const abilities = rawAbilities.map((v) => v / 10);
    const stress = view.getUint32(o + 36, true);
    const fatigue = view.getUint32(o + 40, true);
    // 「生病」的艺人疲劳可以超过 500：Story0008 欧怡青 fatigue 528、Auto 832，
    // 都是存档里真实在册的签约艺人。上界放到 1000 仍能挡住 1111 的占位块。
    if (stress > 1000 || fatigue > 1000) continue;
    const labelLength = view.getUint32(o + 44, true);
    if (labelLength < 2 || labelLength > 12 || o + 48 + labelLength * 4 + 100 > bytes.length) continue;
    const statusBytes = new Uint8Array(labelLength);
    let statusOk = true;
    for (let j = 0; j < labelLength; j += 1) {
      const v = view.getUint32(o + 48 + 4 * j, true);
      // One byte per int32: either plain ASCII or a sign-extended Big5 byte.
      if (v > 0xff && v < 0xffffff80) statusOk = false;
      statusBytes[j] = v & 0xff;
    }
    if (!statusOk) continue;
    const condition = decodeBig5(statusBytes);
    // The status label is the discriminator: the 999 "cap" blocks that follow
    // each artist have no such Chinese label and are filtered out here.
    if (!/^[\u4e00-\u9fff]+$/.test(condition)) continue;
    const socialAt = o + 48 + labelLength * 4;
    const social = Array.from({ length: 5 }, (_, j) => view.getUint32(socialAt + 4 * j, true));
    // 名气 / 魅力 in newer saves reach four digits (×10 scale), so this is only
    // a sanity bound; it must not be tight enough to drop real artists.
    if (!social.every((v) => v <= 99999)) continue;
    // 礼物数在头部友好度表第二格，不在这里；social 之后的 5 个 int32 是 0/1 标志位。
    // 真正的作品数在块 +248，见下面的读取。
    const flagSlots = Array.from({ length: 5 }, (_, j) => view.getUint32(socialAt + 24 + 4 * j, true));
    if (!flagSlots.every((v) => v <= 9999)) continue;
    // Ids 78 / 79 are unused template blocks whose nine abilities are all 1111.
    if (abilities.every((v) => v === abilities[0])) continue;
    const roleId = o >= 16 ? view.getUint32(o - 16, true) : 0;
    if (PLACEHOLDER_ARTIST_IDS.includes(roleId)) continue;
    // 作品数五个一组，固定在状态块 +248：电视 / 电影 / 唱片 / 广告 / 主持。
    // 这是游戏自己维护的「已完成作品」统计 —— 四份存档上逐位核对过
    // （Story0034 林芬芬 0/1/3/2/1、關古威 8/3/6/10/0、新名紗雪 1/3/1/3/0、
    //  克烈斯 7/1/0/9/1 与玩家看到的界面完全一致）。它已经包含艺人加入公司
    //  之前在原公司的履历，也不把还在拍的通告算进来，比自己数清单更可靠。
    if (o + 268 > end) continue;
    const noticeCounts = Array.from({ length: 5 }, (_, j) => view.getUint32(o + 248 + 4 * j, true));
    if (!noticeCounts.every((v) => v <= 999)) continue;
    // 称号编号紧跟在角色编号后面（块头 `[编号][称号][公司][?]`）。
    // 0 表示还没有称号：刚签下、还没作品时会读到 0，不是解析失败。
    const titleId = o >= 16 ? view.getUint32(o - 12, true) : 0;
    // One block per artist; keep the first so a stray later match cannot shadow it.
    if (seen.has(roleId)) continue;
    seen.add(roleId);
    const signed = o >= 8 && view.getUint32(o - 8, true) === 1;
    // 当前合约：状态块 +308 起两个 [年,月,日,星期] 四元组，+340 签约金，+344 分红。
    // 四份存档核对过（Auto 萧依莉 2006/1/1 - 2010/1/24、0 元、50%）。未签约的
    // 占位日期不冒充真实合约，只有 signed 才读。
    let contract: ArtistContract | null = null;
    if (signed && o + 348 <= end) {
      const sy = view.getUint32(o + 308, true);
      const sm = view.getUint32(o + 312, true);
      const sd = view.getUint32(o + 316, true);
      const ey = view.getUint32(o + 324, true);
      const em = view.getUint32(o + 328, true);
      const ed = view.getUint32(o + 332, true);
      if (sy >= 2000 && sy <= 2100 && sm >= 1 && sm <= 12 && sd >= 1 && sd <= 31
        && ey >= 2000 && ey <= 2100 && em >= 1 && em <= 12 && ed >= 1 && ed <= 31) {
        contract = {
          signDate: `${sy}/${sm}/${sd}`,
          expireDate: `${ey}/${em}/${ed}`,
          signingBonus: view.getUint32(o + 340, true),
          dividend: view.getUint32(o + 344, true),
        };
      }
    }
    index += 1;
    out.push({
      friendship: roleId in friendship ? friendship[roleId] : null,
      abilities, stress, fatigue, social,
      gifts: roleId in giftCounts ? giftCounts[roleId] : 0,
      condition,
      noticeCounts,
      titleId, title: (titleId > 0 && titles[String(titleId)]) || '',
      titleMeta: (titleId > 0 && titleMeta[String(titleId)]) || null,
      // 下一档还要看奖项与演唱会（攻略页 PS 条件），那两张表在这一层还没解析，
      // 等 parseSave 里奖项 / 活动挂上后再统一算。
      titleNext: null,
      roleId, signed, offset: o, index,
      awards: [],
      events: [],
      contract,
    });
  }
  return out;
}

interface DateTuple { y: number; m: number; d: number; w: number; day: number }

function fmtDate(t: DateTuple): string {
  return `${t.y}/${t.m}/${t.d}`;
}

/** The game stores [year, month, day, weekday] int32 tuples, with 1 = Monday
 *  and 7 = Sunday. Verified: 2006/1/16 is w1, 2006/4/9 is w7. */
function noticeDates(view: DataView, start: number, end: number): DateTuple[] {
  const dates: DateTuple[] = [];
  for (let o = start; o + 16 <= end; o += 4) {
    const y = view.getUint32(o, true);
    const m = view.getUint32(o + 4, true);
    const d = view.getUint32(o + 8, true);
    const w = view.getUint32(o + 12, true);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 && w >= 1 && w <= 7) {
      dates.push({ y, m, d, w, day: dayNumber(y, m, d) });
      o += 12; // skip the rest of the tuple; the loop adds the final 4
    }
  }
  return dates;
}

/** A bookable notice has exactly three consecutive dates:
 *  open (Monday), shooting start (Monday), shooting end (Sunday). */
function scheduleDates(dates: DateTuple[]): DateTuple[] | null {
  for (let i = 0; i + 2 < dates.length; i += 1) {
    const [a, b, c] = [dates[i], dates[i + 1], dates[i + 2]];
    if (a.w === 1 && b.w === 1 && c.w === 7 && a.day < b.day && b.day < c.day) {
      return [a, b, c];
    }
  }
  return null;
}

/** Notice blocks start with the code stored as one ASCII int32 per character. */
function findCodeBlocks(
  view: DataView, start: number, end: number,
): { code: string; start: number; end: number }[] {
  const marks: { code: string; start: number }[] = [];
  for (let o = start; o + 20 <= end; o += 4) {
    let code = '';
    for (let j = 0; j < 5; j += 1) {
      const v = view.getUint32(o + 4 * j, true);
      if (v < 0x20 || v > 0x7a) break;
      code += String.fromCharCode(v);
    }
    if (code.length === 5 && /^(?:CD|CF|MV|TV|SH|FS|TH|SP)[0-9A-Z]{3}$/.test(code)) {
      marks.push({ code, start: o });
      o += 16;
    }
  }
  return marks.map((mark, index) => ({
    ...mark,
    end: index + 1 < marks.length ? marks[index + 1].start : end,
  }));
}

/** The save header keeps the in-game date as [year, month, day, weekday]. */
function readCurrentDate(view: DataView, byteLength: number): GameDate | null {
  const limit = Math.min(byteLength, 4096);
  for (let o = 0; o + 16 <= limit; o += 4) {
    const y = view.getUint32(o, true);
    const m = view.getUint32(o + 4, true);
    const d = view.getUint32(o + 8, true);
    const w = view.getUint32(o + 12, true);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 && w >= 1 && w <= 7) {
      return {
        y, m, d, weekday: w,
        text: `${y}/${m}/${d}`,
        label: WEEKDAYS[w] ?? '',
        dayNumber: dayNumber(y, m, d),
      };
    }
  }
  return null;
}

/** 定长 Big5 字段：遇 NUL 截断。玩家名短的后面是未初始化残留，解出控制字符
 *  就整段丢掉 —— 宁可显示空白，也不把乱码糊到界面上。 */
function readFixedText(bytes: Uint8Array, start: number, length: number): string {
  if (start + length > bytes.length) return '';
  const slice = bytes.subarray(start, start + length);
  const stop = slice.indexOf(0);
  const body = stop < 0 ? slice : slice.subarray(0, stop);
  if (body.length < 2) return '';
  const text = decodeBig5(body);
  return /[\u0000-\u001f\ufffd]/.test(text) ? '' : text;
}

/** `Firm` 段体：先公司数量，然后每家一条
 *  `[编号][形象字节数][每字节一个 int32][知名度][公关][0]`。编号 1 是我方，
 *  2..5 是对手公司。形象里的字节是按**有符号** int32 存的，取低 8 位再拼；
 *  知名度与公关和艺人属性一样是 ×10 存的，读出来要除以 10。 */
function readFirmStats(
  bytes: Uint8Array,
  view: DataView,
  block: [number, number] | undefined,
): { image: string; fame: number; pr: number; offset: number } | null {
  if (!block) return null;
  const body = block[1];
  if (body + 4 > bytes.length) return null;
  const count = view.getInt32(body, true);
  if (count < 1 || count > 32) return null;
  let o = body + 4;
  for (let i = 0; i < count; i += 1) {
    if (o + 12 > bytes.length) return null;
    const id = view.getInt32(o, true);
    const len = view.getInt32(o + 4, true);
    if (id < 1 || id > 32 || len < 0 || len > 64) return null;
    const dataAt = o + 8;
    if (dataAt + len * 4 + 12 > bytes.length) return null;
    if (id !== 1) {
      // 不是我方就跳过，结构照样要按长度推。
      o = dataAt + len * 4 + 12;
      continue;
    }
    const chars = new Uint8Array(len);
    for (let k = 0; k < len; k += 1) chars[k] = view.getInt32(dataAt + k * 4, true) & 0xff;
    // 和艺人属性一样，这两位在存档里是 ×10 存的；除以 10 才是游戏界面的值。
    const rawFame = view.getInt32(dataAt + len * 4, true);
    const rawPr = view.getInt32(dataAt + len * 4 + 4, true);
    if (rawFame < 0 || rawFame > 99999999 || rawPr < 0 || rawPr > 99999999) return null;
    const image = decodeBig5(chars).replace(/\0/g, '').trim();
    return {
      image: /[\ufffd]/.test(image) ? '' : image,
      fame: rawFame / 10,
      pr: rawPr / 10,
      offset: o,
    };
  }
  return null;
}

/** 公司信息：名字与主角在头部定长字段，形象 / 知名度 / 公关在 `Firm` 段，
 *  资金在头部 @80（可以是负数）。 */
export function parseCompany(
  bytes: Uint8Array,
  view: DataView,
  firm: [number, number] | undefined,
): CompanyInfo | null {
  const name = readFixedText(bytes, 4, 20);
  const protagonist = readFixedText(bytes, 24, 16);
  const money = bytes.length >= 84 ? view.getInt32(80, true) : NaN;
  const stats = readFirmStats(bytes, view, firm);
  if (!name && !protagonist && !stats) return null;
  return {
    name,
    protagonist,
    image: stats?.image ?? '',
    fame: stats?.fame ?? NaN,
    pr: stats?.pr ?? NaN,
    money,
    offset: stats?.offset ?? 0,
  };
}

/** Read the player's teams from the save's `Team` section.
 *
 *  Layout verified against Auto / Story0001 / Story0003 / Story0004 /
 *  Story0007 / Ending0009: a team record is [编码][名字节长度][Big5 名字] and,
 *  a fixed distance after the name, the member artist numbers (第 0 个是队长).
 *  A team the player never formed simply has no record — 旗下没有团体时这里是空数组。
 *
 *  The section also holds each team's current 通告, whose record quotes the
 *  team name too. Two shapes count as a real team: the usual one ends with the
 *  "Invaid" class label, and (Ending0009 的 101 大小姐) some records stop right
 *  after the member numbers. 通告 references match neither, so they stay out. */
export function parseTeams(
  bytes: Uint8Array,
  view: DataView,
  blocks: Record<string, [number, number]>,
): TeamRecord[] {
  const start = blocks.Team ? blocks.Team[1] : -1;
  const end = blocks.Schedule ? blocks.Schedule[0] : bytes.length;
  if (start < 0 || start >= bytes.length) return [];
  const limit = Math.min(end, bytes.length);
  const MARKER = [73, 110, 118, 97, 105, 100]; // "Invaid", the class's own label
  const out: TeamRecord[] = [];
  for (let o = start; o + 120 <= limit; o += 4) {
    const code = view.getUint32(o, true);
    if (code < 101 || code > 199) continue;
    const nameBytes = view.getUint32(o + 4, true);
    if (nameBytes < 4 || nameBytes > 24 || nameBytes % 2 !== 0) continue;
    const chars = new Uint8Array(nameBytes);
    let isText = true;
    for (let j = 0; j < nameBytes; j += 1) {
      const v = view.getUint32(o + 8 + 4 * j, true);
      if (v > 0xff && v < 0xffffff80) { isText = false; break; }
      chars[j] = v & 0xff;
    }
    if (!isText) continue;
    const name = decodeBig5(chars);
    if (!/^[\u4e00-\u9fff]+$/.test(name)) continue;
    const nameEnd = o + 8 + nameBytes * 4;
    if (nameEnd + 72 > bytes.length) continue;
    const hasMarker = view.getUint32(nameEnd + 44, true) === MARKER.length
      && MARKER.every((c, j) => view.getUint32(nameEnd + 48 + 4 * j, true) === c);
    const idA = view.getUint32(nameEnd + 28, true);
    const idB = view.getUint32(nameEnd + 32, true);
    const idC = view.getUint32(nameEnd + 36, true);
    // 没有尾部标记的记录：名字后面先是一个小数值，再是两三个艺人编号，然后归零。
    const shapeOk = view.getUint32(nameEnd + 24, true) <= 99
      && idA >= 1 && idA <= 96 && idB >= 1 && idB <= 96
      && (idC === 0 || (idC >= 1 && idC <= 96))
      && view.getUint32(nameEnd + 40, true) === 0;
    if (!hasMarker && !shapeOk) continue;
    const memberIds: number[] = [];
    for (let j = 0; j < 3; j += 1) {
      const id = view.getUint32(nameEnd + 28 + 4 * j, true);
      if (id >= 1 && id <= 96 && !memberIds.includes(id)) memberIds.push(id);
    }
    if (out.some((team) => team.code === code)) continue;
    // 团体唱片作品数：名字末尾 +24（名字长度不同会浮动，不能用固定偏移）。
    // 老记录靠 shapeOk 已保证 ≤99；带 Invaid 标记的也顺手校验一次。
    const rawWorkCount = view.getUint32(nameEnd + 24, true);
    const workCount = rawWorkCount <= 99 ? rawWorkCount : 0;
    // 名气 / 人气与甜蜜乐章同构：nameEnd+4 / +8 是千分位累计值，界面 ÷1000 取整。
    // 玩家截图逐项核对：Story0001 風敏樂團 8036/6608 → 8/6、Story0014 9999/9999 → 9/9、
    // Story0062 千金小姐 4000/2890 → 4/2。三档全命中。
    const fame = Math.max(0, Math.floor(view.getUint32(nameEnd + 4, true) / 1000));
    const popularity = Math.max(0, Math.floor(view.getUint32(nameEnd + 8, true) / 1000));
    out.push({ code, name, memberIds, workCount, fame, popularity, offset: o });
  }
  return out.sort((a, b) => a.code - b.code);
}

/** Resolve a team's member ids to display names; 第 0 个成员就是队长。 */
export function buildGroupRecord(
  team: TeamRecord,
  nameOf: (id: number) => string,
): GroupRecord {
  const leaderId = team.memberIds[0] ?? 0;
  return {
    ...team,
    leaderId,
    leaderName: team.memberIds.length ? nameOf(leaderId) : '',
    memberNames: team.memberIds.map(nameOf),
  };
}

/** 通告被谁接走了。
 *
 *  存档里没有「角色 → 艺人」的字段（192 字节的角色记录在两个存档间逐字节比对过，
 *  除了 roll 出来的星级/数值，没有空位放艺人编号）。艺人与通告的对应写在
 *  **艺人状态块后面那串「作品清单」**里：每条 28 字节，形如
 *  `[5][5 字符通告编码][类别]`，连续的清单一直排到下一个艺人块的表头，条数写在
 *  清单最前面。所以按「块 N 之后到块 N+1 表头」切区间，把区间内出现的编码都
 *  算作块 N 的作品。
 *
 *  实测对上：Auto 存档里接了「守候 / 背叛」男主角的是 13 号（黎華），
 *  Story0007 里接下「天才與白痴」男主角与「最後一次再想他」的是 76 号（衛亞）。
 *  通告池里出现的编码只可能是当期的，所以命中的就是当前预约。
 *
 *  作品数**不**在这里数：清单记的是「参与记录」，同一部片子会因为语种/版次
 *  重复出现好几条，也在接取那一刻就写进去了。游戏自己统计好的数字在状态块
 *  +248（见 parseArtists 的 noticeCounts），那份才是界面上的作品数。 */
export interface ArtistWorks {
  owners: Record<string, { id: number; name: string; gender: Gender }[]>;
}

export function parseCaseOwners(
  bytes: Uint8Array,
  view: DataView,
  artists: ArtistStats[],
  stars: CaseTables['stars'],
  limit: number,
): ArtistWorks {
  const owners: ArtistWorks['owners'] = {};
  const rows = [...artists].sort((a, b) => a.offset - b.offset);
  for (let k = 0; k < rows.length; k += 1) {
    const artist = rows[k];
    // 清单排在块后面，到下一个块的表头（id 在能力值前 16 字节）为止。
    const end = Math.min(k + 1 < rows.length ? rows[k + 1].offset - 16 : limit, bytes.length);
    // 名字与性别都只认游戏数据表 stars（StarRole.dat）；表里没有的编号才
    // 回退到人工目录的名字，再兜底成「艺人 #N」。
    const entry = stars?.[String(artist.roleId)];
    const gender = starGender(artist.roleId, stars);
    const name = entry?.[0] || ARTIST_DIRECTORY.find((a) => a.id === artist.roleId)?.name
      || `艺人 #${artist.roleId}`;
    for (const item of readNoticeCode(view, artist.offset, end)) {
      const list = (owners[item] ??= []);
      if (!list.some((owner) => owner.id === artist.roleId)) {
        list.push({ id: artist.roleId, name, gender });
      }
    }
  }
  return { owners };
}

/** 5 个 ascii 字符挤在 20 字节里的通告编码，扫区间内每一个 4 字节位置。 */
function readNoticeCode(view: DataView, start: number, end: number): string[] {
  const out: string[] = [];
  for (let o = start; o + 20 <= end; o += 4) {
    let code = '';
    for (let j = 0; j < 5; j += 1) {
      const v = view.getUint32(o + 4 * j, true);
      if (v < 0x20 || v > 0x7a) { code = ''; break; }
      code += String.fromCharCode(v);
    }
    if (code.length !== 5 || !/^(?:CD|CF|MV|TV|SH)[0-9A-Z]{3}$/.test(code)) continue;
    out.push(code);
    o += 16;
  }
  return out;
}

/** 一条正在拍（或已拍完 / 已逾期）的通告。
 *
 *  筹备中的通告来自 CaseFirm（当期可接取列表），已经在拍的不在这里 ——
 *  它们在 Case 段留着一条带「接取记录」的通告块。接取记录的形状在
 *  Auto(CF014 蕭依莉)、Ending0009(CD089 / CD090 / MV031)、Story0007
 *  (MV601) 上逐字节核对过：
 *
 *    [艺人编号][已完成天数][状态][?][酬劳]
 *
 *  即艺人后面紧跟已完成天数（样本里 4 / 23 / 34 / 0 全对得上），再隔
 *  12 字节是这条通告的酬劳（5000 / 950 万 / 1550 万）。酬劳不进静态表：
 *  同一个 CD089 在 Ending0009 记 950 万、在 Story0007 记 790 万，会随接演
 *  艺人变化，所以只认存档里的值。 */
export type ShootingRisk = 'ok' | 'tight' | 'late' | 'unknown';
/** 一位接演艺人自己的进度状态：还没到开拍日 / 正在拍 / 已经拍够天数。 */
export type ShootingStatus = 'pending' | 'shooting' | 'done';

/** 排期余量的提醒阈值（天）。
 *
 *  玩家口径：不判断「排得下 / 排不下」这种结论，只给两种提醒 ——
 *  1) 剩下的日子按每周上限折算后，离「刚好够」还剩 ≤ 5 天 → 逾期风险
 *     （艺人会失误、会生病，余量太薄就可能拖过杀青）；
 *  2) 折算完还不够 → 违约提醒。 */
export const RISK_SLACK_DAYS = 5;

/** 按「还能排几天」和「还要拍几天」的差额给提醒。
 *  多出来的余量 ≤ RISK_SLACK_DAYS 就算有逾期风险。 */
export function riskOf(needDays: number, canShootDays: number, daysPerWeek: number): ShootingRisk {
  if (needDays <= 0) return 'ok';
  if (!(daysPerWeek > 0)) return 'unknown';
  const slack = canShootDays - needDays;
  if (slack < 0) return 'late';
  return slack <= RISK_SLACK_DAYS ? 'tight' : 'ok';
}

/** 一条通告里某一位接演艺人的进度。
 *
 *  同一条通告上，不同艺人各拿一个角色、各拍各的天数、各拿各的酬劳，
 *  所以进度必须按「通告 × 艺人」分开算 —— 拿 notice 上的合计值会错。 */
export interface ShootingCast {
  artistId: number;
  artistName: string;
  /** 该艺人在这条通告里拿到的角色；null 表示角色都已被别人占满。 */
  role: RoleRecord | null;
  /** 这条通告 + 这个角色要拍几天（Length 表），0 表示静态表没这条。 */
  workDays: number;
  /** 每週最多能排几天。 */
  daysPerWeek: number;
  /** 存档里记的、这位艺人的已完成天数。 */
  doneDays: number;
  /** 存档里记的、这位艺人的酬劳，0 表示没读到。 */
  pay: number;
  /** 这位艺人还要再拍几天。 */
  needDays: number;
  /** 按每週上限折算，剩下的日子里最多还能排几天。 */
  canShootDays: number;
  risk: ShootingRisk;
  status: ShootingStatus;
}

/** 拍摄中通告里的「非我方角色」。
 *  接演人编号、名字、性别都从接取记录 + 游戏艺人表 stars 精确读出；角色归属
 *  按接取记录的 24B 顺序对应角色号，也是精确数据（1804 条通告核对过）。
 *  对手的进度/酬劳在存档里是 0，没有真值可读，界面显示「—」。 */
export interface ShootingOtherCast {
  artistId: number | null;
  artistName: string;
  role: RoleRecord | null;
  /** true＝这个角色格没人接。 */
  vacant: boolean;
}

export interface ShootingNotice {
  code: string;
  name: string;
  category: string;
  type: string;
  subtype: string;
  company: string;
  firmName: string;
  /** 角色与难度（星级），和筹备中表格同一套角色记录。 */
  roles: RoleRecord[];
  /** 接演的艺人，一人一条进度。只含我方签约艺人，进度是真值。 */
  casts: ShootingCast[];
  /** 其他公司的演员 + 没人接的角色格。进度/酬劳没有真值。 */
  otherCasts: ShootingOtherCast[];
  startDate: string;
  endDate: string;
  startDay: number;
  endDay: number;
  /** 到杀青还剩几个日历日；NaN 表示存档没有档期可读。 */
  daysLeft: number;
  /** 这条通告最差的那位艺人的风险，用来给整条通告排序/标色。 */
  risk: ShootingRisk;
  offset: number;
}

/** 一位接演艺人自己在这条自制通告上的记录。 */
export interface SelfMadeCast {
  artistId: number;
  artistName: string;
  /** 这位艺人拿到的角色；null 表示角色格已经分配完。 */
  role: RoleRecord | null;
  /** 存档记的酬劳，0 表示没读到。 */
  pay: number;
  /** 是不是自己旗下的艺人。对手公司的演员只用来占角色格，不上表。 */
  mine: boolean;
  /** 这位艺人自己已经拍完的天数（存档 +8 那一格）。 */
  doneDays: number;
  /** 这位艺人还差几天 = 总天数 - 已完成；0 表示他那份拍完了。 */
  needDays: number;
  /** 这位艺人这条通告上总共要拍几天：优先取长度表，查不到才用存档的
   *  「已完成 + 还差」。 */
  workDays: number;
  /** 团体通告（角色名带「團體」）签约的是整个团，这里给出团名与成员；
   *  个人通告为 null。天数仍然算在这位接演艺人（通常是团长）身上。 */
  group: { name: string; leaderName: string; memberNames: string[] } | null;
}

/** 自制通告的档期状态，全部由块里的「开拍日 → 杀青日」推出来。
 *  `overdue` 只作历史兼容保留，不再产生：档期一过作品就发布了，存档里的
 *  进度字段是杀青时的快照，不能拿来判逾期（见下方状态判定的注释）。 */
export type SelfMadeStatus = 'pending' | 'shooting' | 'done' | 'overdue' | 'unknown';

/** 「自制通告及其他」里的一条：玩家自己出品（少数沿用原厂牌署名）的通告。
 *
 *  真源是 CaseCreate 段 —— 段名后是 4 字节条数，然后每条 28 字节
 *  [编码 5×int32][类别][天数]。这份列表按制作顺序累积，Ending0004 里正好
 *  20 条，跟游戏「通告列表 → 自制通告及其他」的排列一一对应。
 *
 *  名字 / 类型 / 出品公司不在存档里，来自 data1 那份更全的静态表：三合一
 *  同装的 data 目录缺 CD6xx / CD7xx 这一批，20 条里有 10 条读不到名字。
 *
 *  要注意自制通告不进 CaseFirm（当期可接取列表），但有**自己一套档期**：
 *  块里按顺序躺着几个 [年][月][日][周几] 四元组，第一个永远是周一（开拍
 *  日），第二个是杀青日，再往后（有的块有）是上档 / 下档。所以进度状态
 *  完全由「今天」落在这段区间的哪一侧决定，跟拍摄中同一口径。 */
export interface SelfMadeNotice {
  /** 在自制列表里的序号，1 起，就是游戏里的排列顺序。 */
  seq: number;
  code: string;
  name: string;
  category: string;
  type: string;
  subtype: string;
  company: string;
  /** 存档里记的天数，与游戏列表名字后面的括号数字一致；0 表示没读到。 */
  days: number;
  /** Length 表的每週上限，用来估算要排几周；0 表示查不到。 */
  daysPerWeek: number;
  roles: RoleRecord[];
  /** 接演记录，按存档里的接取顺序；含对手公司的人，用 mine 区分。 */
  casts: SelfMadeCast[];
  /** 开拍日 / 杀青日，空的表示这一块读不到档期。 */
  startDate: string;
  endDate: string;
  startDay: number;
  endDay: number;
  /** 距杀青还有几个日历日；NaN 表示没有档期。 */
  daysLeft: number;
  /** 距开拍还有几个日历日；已经开拍时 ≤ 0，NaN 表示没有档期。 */
  daysToStart: number;
  status: SelfMadeStatus;
  offset: number;
}

/** 自制通告块里的一条接演记录长这样（24 字节）：
 *  [状态位 0..3][艺人编号 1..96][已完成天数][?][还差天数][酬劳]。
 *
 *  「已完成」在前（+8）、「还差」在后（+16）：Story0055 的卫亚（有朋自遠方來）
 *  读出来是 22 / 3 —— 拍了 22 天、还差 3 天，跟游戏界面对得上。
 *
 *  总天数不从这两个数相加，而是**先查长度表**（`notice-length.csv`，唱片 25 天
 *  这一类），因为「还差」那一格会被游戏中途改写（Story0055 的聆香已完成 10、
 *  记录里却写着还差 5，实际还差 15），相加会算少。只有长度表查不到时才退回
 *  「已完成 + 还差」。
 *
 *  块里还混着长度表、角色槽的一堆整数，单看形状会误报，所以要求酬劳是
 *  **万位整数**，并且只认连续排成一串的那一段（真接演总是连着的）。 */
function isSelfMadeCast(view: DataView, offset: number, limit: number): boolean {
  if (offset < 0 || offset + 24 > limit) return false;
  const flag = view.getUint32(offset, true);
  const artistId = view.getUint32(offset + 4, true);
  if (flag > 3 || artistId < 1 || artistId > 96) return false;
  const a = view.getUint32(offset + 8, true);
  const b = view.getUint32(offset + 12, true);
  const c = view.getUint32(offset + 16, true);
  const pay = view.getUint32(offset + 20, true);
  if (a > 999 || b > 99 || c > 99) return false;
  return pay >= 10000 && pay <= 100000000 && pay % 10000 === 0;
}

/** 读出这条自制通告的接演名单，并按接取顺序分配角色。
 *
 *  角色分配跟拍摄中完全一样：带着**全部**接演人一起走，对手公司的演员也
 *  占一格，否则自家艺人会落到别人那格上（男主角 / 男配角错位）。 */
function readSelfMadeCasts(
  view: DataView,
  start: number,
  end: number,
  mineIds: Set<number>,
  names: Map<number, string>,
  genders: Map<number, Gender>,
  roles: RoleRecord[],
  workOf: (role: RoleRecord | null) => number,
): SelfMadeCast[] {
  const limit = Math.min(end, view.byteLength);
  let bestStart = -1;
  let bestLen = 0;
  for (let o = start + 16; o + 24 <= limit; o += 4) {
    if (!isSelfMadeCast(view, o, limit)) continue;
    let len = 1;
    let p = o + 24;
    while (isSelfMadeCast(view, p, limit)) {
      len += 1;
      p += 24;
    }
    if (len > bestLen) {
      bestLen = len;
      bestStart = o;
    }
  }
  if (bestStart < 0) return [];

  const rows: SelfMadeCast[] = [];
  const claimed = new Set<string>();
  for (let i = 0; i < bestLen; i += 1) {
    const base = bestStart + i * 24;
    const artistId = view.getUint32(base + 4, true);
    const pay = view.getUint32(base + 20, true);
    const gender = genders.get(artistId) ?? 'any';
    let role = roles.find((item) => !claimed.has(item.roleCode) && canTakeRole(item, gender)) ?? null;
    if (role) claimed.add(role.roleCode);
    else if (roles.length === 1) role = roles[0];
    const doneDays = view.getUint32(base + 8, true);
    const savedNeed = view.getUint32(base + 16, true);
    // 总天数以长度表为准（唱片 25 / 连续剧主角 45…），「还差」那一格只在长度表
    // 查不到时才拿来兜底 —— 它会随进度被游戏改写，直接相加会少算。
    const tableWork = workOf(role);
    const workDays = tableWork > 0
      ? Math.max(tableWork, doneDays)
      : Math.max(doneDays, doneDays + savedNeed);
    rows.push({
      artistId,
      artistName: names.get(artistId) ?? `编号${artistId}`,
      role,
      pay,
      mine: mineIds.has(artistId),
      doneDays,
      needDays: Math.max(0, workDays - doneDays),
      workDays,
      group: null,
    });
  }
  return rows;
}

/** 自制通告块里的档期四元组，按块内顺序。
 *
 *  第一个是开拍日（全库 446 个块无一例外都是周一），第二个是杀青日；
 *  有的块后面还跟着上档 / 下档两个日期，这里一并返回，由调用方取前两个。 */
function readSelfMadeDates(view: DataView, start: number, end: number): DateTuple[] {
  const out: DateTuple[] = [];
  const limit = Math.min(end, view.byteLength);
  for (let o = start; o + 16 <= limit; o += 4) {
    const y = view.getUint32(o, true);
    const m = view.getUint32(o + 4, true);
    const d = view.getUint32(o + 8, true);
    const w = view.getUint32(o + 12, true);
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31 || w < 1 || w > 7) continue;
    out.push({ y, m, d, w, day: Math.floor(Date.UTC(y, m - 1, d) / 86400000) });
    o += 12;
  }
  return out;
}

/** CaseCreate 段：自制通告的编码清单，按制作顺序。
 *
 *  段名后面跟 4 字节条数，再 4 字节（固定值 5），然后每条 28 字节：
 *  [编码 5×int32][类别 4=唱片 / 2=电视][天数]。最后一条只有 24 字节（少了
 *  末尾那个字段），所以只读编码，天数另外从 Case 段的块头取。 */
function parseCaseCreate(
  view: DataView, blocks: Record<string, [number, number]>,
): string[] {
  const section = blocks.CaseCreate;
  if (!section) return [];
  const head = section[1];
  if (head + 12 > view.byteLength) return [];
  const count = view.getUint32(head, true);
  if (count > 400) return [];
  const out: string[] = [];
  for (let k = 0; k < count; k += 1) {
    const at = head + 8 + k * 28;
    if (at + 20 > view.byteLength) break;
    let code = '';
    for (let j = 0; j < 5; j += 1) {
      const v = view.getUint32(at + 4 * j, true);
      if (v < 0x20 || v > 0x7a) { code = ''; break; }
      code += String.fromCharCode(v);
    }
    if (!/^(?:CD|CF|MV|TV|SH|FS|TH|SP)[0-9A-Z]{3}$/.test(code)) break;
    out.push(code);
  }
  return out;
}

/** 剩下 N 个日历日、每週最多 M 天，最多还能排几天。 */
export function shootableDays(remaining: number, perWeek: number): number {
  if (!(remaining > 0) || !(perWeek > 0)) return 0;
  const weeks = Math.ceil(remaining / 7);
  return Math.min(remaining, weeks * perWeek);
}

/** 从通告块里读接取记录，一位艺人一条。
 *
 *  记录是 24 字节一条：
 *
 *      [状态位][艺人编号][已完成天数][?][?][酬劳]
 *
 *  即编号后紧跟完成天数，编号前 4 字节是个 0~3 的状态位，编号后 16 字节
 *  才是这位艺人拿到的酬劳。Auto(CF014 萧依莉 4 天 / 5000)、
 *  Ending0009(MV031 原少緯 34 天 / 1550 万、桑禾蓓 29 天 / 1450 万、
 *  天晴 22 天 / 31 万、林芬芬 22 天 / 150 万)、Story0007(MV601 衛亞 40 天 /
 *  1500 万、姚子奇 25 天 / 810 万) 都按这个形状对上。
 *
 *  块后面还有日期段，里面的年份/日号会撞上 1、2、6 这类小艺人编号，所以
 *  每条候选都要过筛：状态位 0~3、完成天数 ≤ 60、中间两个字段 ≤ 99、酬劳
 *  要么 0 要么 ≥ 1000。筛过之后同一艺人只取第一条，避免串到邻近档期。
 *
 *  记录按 24 字节连续排列，从「第一条真的拿到酬劳（pay ≥ 1000）的记录」
 *  起定出 24B 网格，再**向前后双向**按网格读。这个锚点很关键：块里散落着
 *  done/pay 全 0 的占位噪声（TV088 +940 前的史蒂芬、CF003 +940 的彭胡 /
 *  +952 的林芬芬），它们单看字段也合法，但不在真记录的 24B 网格上。
 *  必须双向读，因为带头像的那位艺人未必排在最前 —— MV025 提心吊膽的
 *  pay=920万 苏嫚君是第 2 条，前面还有 pay=0 的黎華（男主角），只往后读
 *  会漏掉他。双向扩展既带进同片所有对手，又不误收噪声。
 *
 *  候选编号取「作品清单里的接演人 ∪ 游戏艺人表全部编号」：对手公司 / NPC
 *  没有状态块、进不了作品清单，但他们的接取记录同样躺在块尾。扫描只走块尾
 *  260 字节 —— 逐份存档核对过所有真记录都在这段里。 */
function readProgress(
  view: DataView,
  start: number,
  end: number,
  ownerIds: number[],
  starIds: number[] = [],
): { artistId: number; doneDays: number; pay: number }[] {
  const rows: { artistId: number; doneDays: number; pay: number }[] = [];
  if (ownerIds.length === 0) return rows;
  const wanted = new Set(starIds.length ? starIds : ownerIds);
  const limit = Math.min(end, view.byteLength);
  const from = starIds.length ? Math.max(start + 400, end - 260) : start + 400;
  // flag 位置起读一条 24B 记录：[flag][id][done][a][b][pay]
  const readAt = (p: number) => ({
    flag: view.getUint32(p, true),
    id: view.getUint32(p + 4, true),
    done: view.getUint32(p + 8, true),
    a: view.getUint32(p + 12, true),
    b: view.getUint32(p + 16, true),
    pay: view.getUint32(p + 20, true),
  });
  const valid = (r: ReturnType<typeof readAt>) =>
    r.flag <= 3 && wanted.has(r.id) && r.done <= 60 && r.a <= 99
    && r.b <= 99 && r.pay <= 1e9 && !(r.pay > 0 && r.pay < 1000);

  if (starIds.length) {
    // 找块尾第一条有酬劳的真记录当锚点，再按 24B 网格往后连续读。
    let anchor = -1;
    for (let p = from; p + 24 <= limit; p += 4) {
      const r = readAt(p);
      if (r.pay >= 1000 && valid(r)) { anchor = p; break; }
    }
    if (anchor >= 0) {
      // 先往回读（anchor-24、anchor-48…），保持文件里的角色顺序；
      // 再从 anchor 往后读。每条都过 sanity，遇到不合法就停。
      for (let p = anchor - 24; p >= from && p + 24 <= limit; p -= 24) {
        const r = readAt(p);
        if (!valid(r)) break;
        if (rows.some((row) => row.artistId === r.id)) continue;
        rows.unshift({ artistId: r.id, doneDays: r.done, pay: r.pay });
      }
      for (let p = anchor; p + 24 <= limit; p += 24) {
        const r = readAt(p);
        if (!valid(r)) break;
        if (rows.some((row) => row.artistId === r.id)) continue;
        rows.push({ artistId: r.id, doneDays: r.done, pay: r.pay });
      }
      return rows;
    }
    // 没有带酬劳的记录（整条通告都没付钱）：退回逐 4 字节扫描，仍只认全部
    // star 编号，宁可多列也别把真接演人漏掉。
  }
  for (let p = from; p + 24 <= limit; p += 4) {
    const r = readAt(p);
    if (!valid(r)) continue;
    if (rows.some((row) => row.artistId === r.id)) continue;
    rows.push({ artistId: r.id, doneDays: r.done, pay: r.pay });
  }
  return rows;
}

/** 世界场景解锁表：8 条独立记录，每条 `[编号 int32 小端][解锁标志 byte][名字 Big5…][NUL]`，
 *  编号 2..9、间隔 0xA0，顺序与 WORLD_SCENES 一致（长城→开罗）。
 *
 *  真源由修改器实测坐实：把「紐約」名字前的标志从 00 改成 01，整份存档只动了
 *  那一个字节。之前误把 `[9][8×0/1][0,4,80,108,97]` 当成解锁表（那其实是别的
 *  数据），导致纽约显示错误；正确字段是紧贴每条场景名字前的那个字节。
 *
 *  定位不写死绝对偏移：扫编号 = 2 的 int32，向后按 0xA0 校验 8 条记录的编号
 *  递增、标志为 0/1、名字是 4 或 6 字节 Big5 双字节字符并以 NUL 结尾。此模式在
 *  102 份样本存档上全部唯一命中（Auto / Story0001..0070 / Ending / 游戏 Save2）。 */
function parseWorldScenes(view: DataView, byteLength: number): WorldScene[] {
  const isBig5Pair = (a: number, b: number) =>
    ((a >= 0x81 && a <= 0xfe) && ((b >= 0x40 && b <= 0x7e) || (b >= 0xa1 && b <= 0xfe)));
  for (let i = 0; i + 4 <= byteLength; i += 1) {
    if (view.getInt32(i, true) !== WORLD_SCENE_FIRST_ID) continue;
    const flags: boolean[] = [];
    let ok = true;
    for (let k = 0; k < WORLD_SCENES.length; k += 1) {
      const off = i + k * WORLD_SCENE_RECORD_STRIDE;
      if (off + 6 > byteLength || view.getInt32(off, true) !== WORLD_SCENE_FIRST_ID + k) {
        ok = false; break;
      }
      const flag = view.getUint8(off + 4);
      if (flag !== 0 && flag !== 1) { ok = false; break; }
      // 名字：4 或 6 字节 Big5 双字节字符，NUL 结尾
      const nameStart = off + 5;
      let len = 0;
      while (nameStart + len < byteLength && view.getUint8(nameStart + len) !== 0 && len < 8) len += 1;
      if (len !== 4 && len !== 6) { ok = false; break; }
      let pairs = true;
      for (let p = 0; p < len; p += 2) {
        if (!isBig5Pair(view.getUint8(nameStart + p), view.getUint8(nameStart + p + 1))) {
          pairs = false; break;
        }
      }
      if (!pairs) { ok = false; break; }
      flags.push(flag === 1);
    }
    if (!ok) continue;
    return WORLD_SCENES.map((scene, k) => ({ ...scene, unlocked: flags[k] }));
  }
  return [];
}

/** 从存档里抠出「我拥有的道具」清单。
 *
 *  存档没有给这段数据起段名，定位靠形态：一段连续的 16 字节小端记录
 *  `[编号, 状态码, 数量, 附字段]`。难点在于这段数据由密集的小整数堆成，
 *  从任意 4 字节偏移读都「长得像」一条记录，所以必须按 16 字节一步去扩段、
 *  并且要求编号**非递减**（真实清单 2→…→2038 是升序的，错位的读取会立刻
 *  出现 0 / 乱序而断掉）。取最长的一段即为道具清单。长度不够就当没找到。
 *
 *  注意：状态码**不能**拿来当过滤条件——它不是道具类型（类型在 Item.dat），
 *  存档里取值五花八门（Auto 里就见过 0/1/2/3/4/7/30/97/0xffffffff，其中
 *  0xffffffff 是借據、男孩的劇本这类剧情道具，97 是爱神巧克力）。按状态码
 *  白名单过滤会把清单从中间断成几段，「最长一段」就丢东西了（2026-11-14
 *  与游戏物品窗口截图核对：Auto 整段应检出 21 件拥有）。
 *
 *  数量 0 的行（店里的、曾经有过但用完的）也在这段里，调用方按需要过滤。 */
export function parseItems(view: DataView, bytes: Uint8Array): OwnedItem[] {
  const n = bytes.length;
  const isItemRow = (o: number): boolean => {
    if (o + 16 > n) return false;
    const code = view.getUint32(o, true);
    const qty = view.getUint32(o + 8, true);
    const meta = view.getUint32(o + 12, true);
    return (
      code > 0 && code < 100000 &&
      qty >= 0 && qty < 100000 &&
      meta >= 0 && meta < 1000
    );
  };
  let bestStart = -1;
  let bestLen = 0;
  let i = 0;
  while (i + 16 <= n) {
    if (!isItemRow(i)) {
      i += 4;
      continue;
    }
    let len = 0;
    let o = i;
    let lastCode = 0;
    while (o + 16 <= n && isItemRow(o)) {
      const code = view.getUint32(o, true);
      if (code < lastCode) break; // 编号必须非递减，错位读取会立刻断掉
      lastCode = code;
      len += 1;
      o += 16;
    }
    if (len > bestLen) {
      bestLen = len;
      bestStart = i;
    }
    // 不能跳到 o：错位起点也可能"长得像"一段，跳过去会把真正的清单起点
    // 一起跳过（Story0002 的 1~7 号道具就是这样丢的）。逐 4 字节扫，命中率
    // 换一点时间，但一份 .sa2 只有 1~2MB。真实清单靠最长段胜出。
    i += 4;
  }
  if (bestLen < 15) return [];
  const items: OwnedItem[] = [];
  for (let k = 0; k < bestLen; k += 1) {
    const o = bestStart + k * 16;
    items.push({
      code: view.getUint32(o, true),
      flag: view.getUint32(o + 4, true),
      quantity: view.getUint32(o + 8, true),
      meta: view.getUint32(o + 12, true),
    });
  }
  return items;
}

/** Parse one uploaded save. The buffer is a snapshot: the game may overwrite
 *  Auto.sa2 on disk at any moment, but this copy never changes. */
export function parseSave(
  buffer: ArrayBuffer,
  tables: CaseTables,
  saveName: string,
): ParseResult {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const blocks = findInt32Names(bytes, view, NAME_BLOCKS);
  if (!blocks.Case || !blocks.CaseEnd) {
    throw new Error('存档里找不到 Case / CaseEnd 段，可能不是明星志愿3 的 .sa2 存档，或版本不兼容。');
  }

  const [caseStart, caseEnd] = [blocks.Case[1], blocks.CaseEnd[0]];
  const roles = parseRoles(bytes, view, caseStart, caseEnd);
  const rolesByCode = new Map<string, RoleRecord[]>();
  for (const role of roles) {
    const list = rolesByCode.get(role.code) ?? [];
    list.push(role);
    rolesByCode.set(role.code, list);
  }
  const firm = blocks.CaseFirm ? parseCaseFirm(view, blocks.CaseFirm[1], bytes.length) : [];
  const codeBlocks = findCodeBlocks(view, caseStart, caseEnd);
  const currentDate = readCurrentDate(view, bytes.length);
  const company = parseCompany(bytes, view, blocks.Firm);
  const today = currentDate?.dayNumber ?? NaN;

  const artistStart = blocks.StarRoleQ ? blocks.StarRoleQ[1] : 0;
  const artistEnd = blocks.Firm ? blocks.Firm[0] : bytes.length;
  const { friendship, gifts } = parseFriendship(view, bytes);
  const artists = parseArtists(
    bytes, view, artistStart, artistEnd, friendship, gifts,
    tables.titles ?? {}, tables.titleMeta ?? {},
  );
  const roster = parseRoster(bytes);
  // The state block carries the game's roster number at -16, so the panel can
  // show named artists instead of anonymous "状态块 #N" selectors.
  const artistDirectory: ArtistOption[] = ARTIST_DIRECTORY.map((entry) => {
    const block = artists.find((a) => a.roleId === entry.id) ?? null;
    return {
      ...entry,
      gender: starGender(entry.id, tables.stars),
      artistIndex: block?.index ?? null,
      signed: block?.signed ?? false,
      title: block?.title ?? '',
      abilities: block?.abilities ?? [],
    };
  });
  // 记事表里的获奖记录，按艺人编号分给各个状态块；公司奖也在里面，
  // 由页面按 `award.company` 决定显示在个人行还是公司行。
  const awards = parseAwards(view, bytes.length, tables.cases);
  // 举办活动（演唱会 / 影友會 / 歌友會）：个人场挂艺人卡，团体场只挂团体卡。
  const events = parseEvents(view, bytes.length);
  // 团体唱片发行清单，供团体卡「通告统计」hover 展示。
  const groupWorks = parseGroupWorks(view, bytes.length, tables.cases);
  // 个人作品清单，供艺人卡五个分类和「作品总数」hover 按时间展示。
  const diaryWorks = parseWorks(view, bytes.length, tables.cases);
  for (const artist of artists) {
    artist.awards = awards.filter((award) => award.artistId === artist.roleId);
    // 团体场（大型团体演唱会等）在团体卡「活动」里展示，不重复挂到艺人卡。
    artist.events = events.filter((event) => event.artistId === artist.roleId && !event.group);
  }
  const teams = parseTeams(bytes, view, blocks);
  // 称号下一档的额外条件要连奖项和演唱会一起判。演唱会按攻略「不限大小、
  // 个人或团体」计：团体场在记事表里只挂一个艺人，同团成员都算办过。
  for (const artist of artists) {
    const teammates = new Set<number>();
    for (const team of teams) {
      if (team.memberIds.includes(artist.roleId)) {
        for (const id of team.memberIds) teammates.add(id);
      }
    }
    const concerts = events.filter((event) => event.kind === 63 && (
      event.artistId === artist.roleId || (event.group && teammates.has(event.artistId))
    )).length;
    artist.titleNext = artist.titleId > 0
      ? nextTitle(
        tables.titleMeta ?? {}, tables.titles ?? {}, artist.titleId,
        {
          abilities: artist.abilities,
          social: artist.social,
          noticeCounts: artist.noticeCounts,
          awardIds: artist.awards.filter((award) => !award.group).map((award) => award.awardId),
          concerts,
        },
        starGender(artist.roleId, tables.stars),
      )
      : null;
  }
  const signedArtistIds = artistDirectory.filter((a) => a.signed).map((a) => a.id);
  // 每个艺人接下的通告编码，用来判断通告池里哪个角色已经被别人占住。
  const { owners: ownersByCode } = parseCaseOwners(bytes, view, artists, tables.stars, artistEnd);
  // 精确到角色号的预约关系（存档里的 52 字节角色预约表）。
  const roleReservations = parseRoleReservations(bytes, view);
  const archiveNotices = parseArchiveNotices(bytes, view, tables, currentDate);
  // 通告本体记录的 4 个角色槽是预约关系的第二真源：筹备中的 MV142 里，
  // 桑禾蓓 / 路風写在 +872 / +848，而 52B 预约表还是空的；只按性别回退会把
  // 桑禾蓓错放到女主角。优先 52B，其次这里的精确角色号，最后才按性别猜。
  const exactReserved = new Map<string, string>();
  for (const notice of archiveNotices) {
    for (const cast of notice.castSlots ?? []) {
      if (!cast.roleCode || !cast.artistId || cast.artistId > 100) continue;
      const name = tables.stars?.[String(cast.artistId)]?.[0]
        ?? ARTIST_DIRECTORY.find((a) => a.id === cast.artistId)?.name;
      if (name) exactReserved.set(`${notice.code}|${cast.roleCode}`, name);
    }
  }
  const scenes = parseWorldScenes(view, bytes.length);
  const items = parseItems(view, bytes).map((it) => {
    const meta = tables.items?.[String(it.code)];
    return {
      ...it,
      name: meta?.[0] ?? `道具 ${it.code}`,
      category: meta?.[1] ?? '',
      desc: meta?.[2] ?? '',
      stats: meta?.[3] ?? '',
    };
  });

  /** code -> best [open, start, end] triple found anywhere in the Case block. */
  const datesByCode: Record<string, DateTuple[]> = {};
  const batchRows: { code: string; company: string; kind: string; dates: DateTuple[] }[] = [];
  for (const block of codeBlocks) {
    const triple = scheduleDates(noticeDates(view, block.start, block.end));
    if (!triple) continue;
    const previous = datesByCode[block.code];
    if (!previous || triple[0].day > previous[0].day) datesByCode[block.code] = triple;
    const info = tables.cases[block.code];
    batchRows.push({
      code: block.code,
      company: info?.[3] ?? '',
      kind: categoryOf(block.code),
      dates: triple,
    });
  }

  // 只按「表里真正列出来的通告」归并批次：存档的 Case 段里还留着大量早已
  // 结束的历史通告，把它们算进来会冒出玩家根本没在等的批次（曾经显示 9 批）。
  const shownCodes = new Set(firm.map((item) => item.code));
  const byDay = new Map<number, UpdateBatch>();
  for (const row of batchRows) {
    if (!shownCodes.has(row.code)) continue;
    const day = row.dates[0].day;
    let batch = byDay.get(day);
    if (!batch) {
      batch = {
        date: fmtDate(row.dates[0]), dayNumber: day,
        label: WEEKDAYS[row.dates[0].w] ?? '',
        companies: [], kinds: [], codes: [],
        daysAway: Number.isFinite(today) ? day - today : NaN,
        scheduled: true,
      };
      byDay.set(day, batch);
    }
    if (row.company && !batch.companies.includes(row.company)) batch.companies.push(row.company);
    if (!batch.kinds.includes(row.kind)) batch.kinds.push(row.kind);
    if (!batch.codes.includes(row.code)) batch.codes.push(row.code);
  }
  const batches = [...byDay.values()].sort((a, b) => a.dayNumber - b.dayNumber);
  const nextUpdate = Number.isFinite(today)
    ? batches.find((batch) => batch.dayNumber > today) ?? null
    : null;
  /** 通告要拍几天、一周最多排几天，来自游戏的 Length 表。表的 key 是
   *  「通告种类|角色」：电视剧按 連續劇/單元劇/短片，电影/广告/唱片按 subtype，
   *  主持按节目类型（知性談話 等），唱片还要把 個人/團體 归到「唱片」下。 */
  const lengthOf = (code: string, info: string[] | undefined, role: string): number[] | null => {
    const type = info?.[1] ?? '';
    const subtype = info?.[2] ?? '';
    const kinds = [subtype, type, KIND_BY_PREFIX[code.slice(0, 2)] ?? ''];
    for (const kind of kinds) {
      if (!kind) continue;
      const hit = tables.length?.[`${kind}|${role}`];
      if (hit && hit[0]) return hit;
    }
    return null;
  };
  const unknownCodes: string[] = [];
  const notices: CaseNotice[] = firm.map((item) => {
    const info = tables.cases[item.code];
    if (!info) unknownCodes.push(item.code);
    const [name = '', type = '', subtype = '', company = ''] = info ?? [];
    const noticeRoles = roles.filter((role) => role.code === item.code);
    // 通告池里的编码只可能是当期通告，命中的艺人就是把它接走的人。
    // 优先用存档的角色预约表：它精确到「通告码 + 角色号」，读不到的才退回
    // 按性别落到第一个还对得上的角色（男→男主角，女→女主角）。
    const taken = new Set<string>();
    const usedOwners = new Set<string>();
    for (const [roleCode, artistName] of roleReservations) {
      const target = noticeRoles.find((role) => role.roleCode === roleCode);
      if (!target || taken.has(roleCode)) continue;
      target.reservedBy = artistName;
      taken.add(roleCode);
      usedOwners.add(artistName);
    }
    for (const [key, artistName] of exactReserved) {
      const [code, roleCode] = key.split('|');
      if (code !== item.code || taken.has(roleCode) || usedOwners.has(artistName)) continue;
      const target = noticeRoles.find((role) => role.roleCode === roleCode);
      if (!target) continue;
      target.reservedBy = artistName;
      taken.add(roleCode);
      usedOwners.add(artistName);
    }
    for (const owner of ownersByCode[item.code] ?? []) {
      if (usedOwners.has(owner.name)) continue;
      const target = noticeRoles.find(
        (role) => !taken.has(role.roleCode) && canTakeRole(role, owner.gender),
      );
      if (!target) continue;
      target.reservedBy = owner.name;
      taken.add(target.roleCode);
      usedOwners.add(owner.name);
    }
    for (const role of noticeRoles) {
      const grades = tables.needEffect[`${type}|${role.role}`];
      role.requirements = ATTRS
        .filter((attr) => role.values[attr])
        .map((attr) => ({
          attr,
          value: role.values[attr],
          staticGrade: grades ? GRADES[grades[ATTRS.indexOf(attr)]] ?? '' : '',
          rolledGrade: gradeOf(role.values[attr], role.star, tables.difficulty),
        }));
      // 社交门槛（叛逆/性感/亲和）是角色的隐藏接演条件，直接从存档读。
      // 它们没有 A/B/C 等级，用 social 标记让 UI 只显示「亲和 650」。
      for (const [key, attr] of [['rebellion', '叛逆'], ['sexy', '性感'], ['affinity', '亲和']] as const) {
        const value = role.social[key];
        if (value) role.requirements.push({ attr, value, staticGrade: '', rolledGrade: '', social: true });
      }
    }
    // 每个角色按自己的角色类型查 Length 表：连续剧 / 电影里男主角、男配角、
    // 女主角、女配角的工作天数各不相同，不能只取通告的第一个角色。
    // notice.workDays 仍保留第一个命中角色的值（CSV 与旧断言用），逐角色的
    // 天数写回各自 RoleRecord，供筹备中表格按行展示。
    for (const role of noticeRoles) {
      const hit = lengthOf(item.code, info, role.role);
      role.workDays = hit?.[0] ?? 0;
      role.daysPerWeek = hit?.[1] ?? 0;
    }
    const length = noticeRoles
      .map((role) => (role.workDays ? [role.workDays, role.daysPerWeek ?? 0] : null))
      .find((hit): hit is number[] => Boolean(hit)) ?? null;
    const triple = datesByCode[item.code];
    const openDate = triple ? fmtDate(triple[0]) : '';
    const periodStart = triple ? fmtDate(triple[1]) : '';
    const periodEnd = triple ? fmtDate(triple[2]) : '';
    const deadline = triple ? dayText(triple[1].day - 1) : '';
    const openDay = triple ? triple[0].day : NaN;
    const startDay = triple ? triple[1].day : NaN;
    const endDay = triple ? triple[2].day : NaN;
    const deadlineDay = startDay - 1;
    const execDays = endDay - startDay + 1;
    const daysToOpen = openDay - today;
    const daysToDeadline = deadlineDay - today;
    const daysToStart = startDay - today;
    const daysToEnd = endDay - today;
    const inProgress = Number.isFinite(today) && today >= startDay && today <= endDay;
    const executedDays = inProgress ? today - startDay + 1 : (today > endDay ? execDays : 0);
    const remainingDays = inProgress ? endDay - today : 0;
    let status: NoticeStatus = 'open';
    if (!triple) status = 'open';
    else if (daysToDeadline < 0) status = 'expired';
    else if (daysToOpen > 0) status = 'upcoming';
    else if (daysToDeadline <= 7) status = 'closing';
    return {
      code: item.code,
      name: name || '（存档专有 / 自制通告）',
      category: categoryOf(item.code),
      type, subtype, company,
      firmSlot: item.firm,
      firmName: tables.firms[String(item.firm)] ?? '',
      openDate, periodStart, periodEnd, deadline,
      execDays: Number.isFinite(execDays) ? execDays : 0,
      workDays: length?.[0] ?? 0,
      daysPerWeek: length?.[1] ?? 0,
      daysToOpen, daysToDeadline, daysToStart, daysToEnd,
      executedDays, remainingDays,
      status,
      roles: noticeRoles,
    };
  });

  /** 各公司开放接取、已经接下、还没杀青的通告。判定只认存档：通告块里留着
   *  接取记录（艺人 + 已完成天数 + 酬劳），并叠加「今天不晚于杀青日」。
   *  自家艺人都拍满天数的那条直接不列 —— 没有在赶期的人。只看自家艺人：
   *  对手公司的演员也占角色坑位，但不进表、不算风险。 */
  const shooting: ShootingNotice[] = [];
  const doneCodes = new Set<string>();
  const openCodes = new Set(firm.map((item) => item.code));
  // 玩家只关心自己公司的艺人：同一部戏里对手公司的演员照样有接取记录，
  // 但进度、酬劳、违约风险都跟玩家无关，不进表也不提醒。
  const mineIds = new Set(signedArtistIds);
  for (const block of codeBlocks) {
    if (doneCodes.has(block.code)) continue;
    // 还挂在 CaseFirm 里的说明是「筹备中、可接取」，即便已经有艺人预约，
    // 也留在上面那张表里，不进拍摄中。
    if (openCodes.has(block.code)) continue;
    const owners = ownersByCode[block.code] ?? [];
    if (owners.length === 0) continue;
    // 接取记录里除了我方，还躺着对手公司 / NPC（没有状态块、进不了作品清单）。
    // 用游戏艺人表的全部编号来读，名字和性别都从表里精确反查。
    const allStarIds = Object.keys(tables.stars ?? {}).map(Number);
    const progress = readProgress(
      view, block.start, block.end, owners.map((o) => o.id), allStarIds,
    );
    if (progress.length === 0) continue;
    const triple = datesByCode[block.code];
    if (!triple) continue;
    const startDay = triple[1].day;
    const endDay = triple[2].day;
    // 存档的 Case 段里躺着大量早就杀青的旧块，它们的接取记录同样非零
    // （艺人作品清单是历史累积），所以杀青日一过就不再列。
    if (!Number.isFinite(today) || today > endDay) continue;
    const daysLeft = endDay - today;
    const info = tables.cases[block.code];
    const [, type = '', subtype = '', company = ''] = info ?? [];
    const noticeRoles = roles.filter((role) => role.code === block.code);
    const fallbackLength = noticeRoles
      .map((role) => lengthOf(block.code, info, role.role))
      .find((hit): hit is number[] => Boolean(hit)) ?? null;

    // 角色归属是**精确数据**：接取记录按角色号顺序排列（24B 网格），记录第 i 条
    // 就是角色表里第 i 个角色。逐份存档核对过 1804 条通告，记录顺序与角色号
    // 100% 对应，所以直接按序号落位，不再靠性别猜。
    // （此前按性别挑会出错：MV025 男/女/男/女四个角色，男主角黎華 pay=0
    //  排在 pay=920万 的苏嫚君前面，"我方优先"重排会把角色全打乱。）
    const sortedRoles = [...noticeRoles].sort((a, b) => a.roleCode.localeCompare(b.roleCode));
    const claimed = new Set<string>();
    const casts: ShootingCast[] = [];
    const otherCasts: ShootingOtherCast[] = [];
    for (let index = 0; index < progress.length; index += 1) {
      const row = progress[index];
      // 我方从作品清单取名字性别；对手 / NPC 没有状态块，回退到游戏艺人表 stars
      // （编号→名字、性别都是精确数据）。
      const starEntry = tables.stars?.[String(row.artistId)];
      const owner = owners.find((o) => o.id === row.artistId) ?? (starEntry ? {
        id: row.artistId, name: starEntry[0], gender: starGender(row.artistId, tables.stars ?? {}),
      } : undefined);
      const gender = owner?.gender ?? 'any';
      // 按序号直接取对应角色；只在性别明显冲突时退回"第一个未占的同性别角色"
      // 兜底（应对记录数多于角色数的团体通告等边界）。
      let role: RoleRecord | null = sortedRoles[index] ?? null;
      if (role && !canTakeRole(role, gender) && sortedRoles.length > 1) {
        role = sortedRoles.find((r) => !claimed.has(r.roleCode) && canTakeRole(r, gender)) ?? role;
      }
      if (role) claimed.add(role.roleCode);
      // 只有一个角色的通告（团体、合唱一类），后接的人也占同一格。
      // 这里也要 claimed.add，否则后面的「角色格已满不再补人」守卫会失灵
      // （CF003 好喝可樂：路敏靠这个兜底拿到唯一的女性格，claimed 却空着，
      //  作品清单里挂过这部戏的彭胡 / 林芬芬就被误补进来）。
      else if (noticeRoles.length === 1) {
        role = noticeRoles[0];
        claimed.add(role.roleCode);
      }
      // 没有签约名单可参照时不做过滤，避免整档「拍摄中」被清空。
      // 对手演员同样要走过角色分配（占住自己那格），否则我方艺人会被挤到
      // 别人的角色上；只是他们不进 casts（进度无真值），单独记到 otherCasts。
      if (mineIds.size > 0 && !mineIds.has(row.artistId)) {
        // 角色按接取记录序号精确落位，不是推测。
        otherCasts.push({
          artistId: row.artistId,
          artistName: owner?.name || `编号${row.artistId}`,
          role,
          vacant: false,
        });
        continue;
      }
      const length = (role ? lengthOf(block.code, info, role.role) : null) ?? fallbackLength;
      const workDays = length?.[0] ?? 0;
      const daysPerWeek = length?.[1] ?? 0;
      const done = workDays > 0 && row.doneDays >= workDays;
      const needDays = done ? 0 : workDays > 0 ? Math.max(0, workDays - row.doneDays) : 0;
      const canShoot = shootableDays(daysLeft, daysPerWeek);
      casts.push({
        artistId: row.artistId,
        artistName: owner?.name || `编号${row.artistId}`,
        role,
        workDays, daysPerWeek,
        doneDays: row.doneDays,
        pay: row.pay,
        needDays, canShootDays: canShoot,
        risk: done ? 'ok' : riskOf(needDays, canShoot, daysPerWeek),
        status: done ? 'done' : today < startDay ? 'pending' : 'shooting',
      });
    }
    if (casts.length === 0) continue;
    // 团体通告（团体唱片等）是「整团接下的一份通告」：存档只给队长写了
    // 接取记录（真实的完成天数与酬劳），队员名下那条 done=0 / pay=0 是
    // 参与清单带出来的噪声，并不是他自己的进度。所以进度只认队长这一份，
    // 队员共享同一组数字（Auto 的 CD602 銀河：千金小姐 队长萧依莉 10/25、
    // 4150 万，队员苏嫚君原本被错显成 0/25）。
    if (noticeRoles.some(isGroupRole)) {
      const group = teams.find((team) =>
        team.memberIds.some((id) => casts.some((cast) => cast.artistId === id)));
      const leader = group
        ? casts.find((cast) => cast.artistId === group.memberIds[0]) ?? null
        : null;
      if (leader) {
        for (const cast of casts) {
          cast.doneDays = leader.doneDays;
          cast.pay = leader.pay;
          cast.workDays = leader.workDays;
          cast.daysPerWeek = leader.daysPerWeek;
          cast.needDays = leader.needDays;
          cast.canShootDays = leader.canShootDays;
          cast.risk = leader.risk;
          cast.status = leader.status;
        }
      }
    }
    // 其他演员补全：作品清单里挂了这部戏、但没有接取记录的人（对手公司
    // 常见，如 CF735 的童靖陽）—— 上面那条循环只看接取记录，会漏掉他们。
    // 我方艺人若没有接取记录说明并没在拍，不列进来。
    const knownIds = new Set<number>([
      ...casts.map((c) => c.artistId),
      ...otherCasts.map((c) => c.artistId ?? -1),
    ]);
    for (const owner of owners) {
      if (knownIds.has(owner.id)) continue;
      if (mineIds.size > 0 && mineIds.has(owner.id)) continue;
      let role = noticeRoles.find((r) => !claimed.has(r.roleCode) && canTakeRole(r, owner.gender)) ?? null;
      // 角色格已经全被接取记录占满就不再补 —— 作品清单是历史累积记录，
      // 同一部片子按语种/版次会有多条，混进来只会多冒出一个没在拍的人。
      if (!role && claimed.size >= noticeRoles.length) continue;
      if (role) claimed.add(role.roleCode);
      else if (noticeRoles.length === 1) role = noticeRoles[0];
      otherCasts.push({
        artistId: owner.id,
        artistName: owner.name,
        role,
        vacant: false,
      });
      knownIds.add(owner.id);
    }
    // 角色表里还没人认领的格＝虚位以待，让玩家看到完整卡司拼图缺了谁。
    for (const role of noticeRoles) {
      if (claimed.has(role.roleCode)) continue;
      otherCasts.push({ artistId: null, artistName: '', role, vacant: true });
    }

    // 自家艺人都交差了就整条收起来：没有在赶期的人，写进表格只是噪音。
    // 注意只看我方 casts —— 对手演员的进度是噪声，不参与收起判断。
    if (casts.every((cast) => cast.status === 'done')) continue;

    const open = casts.filter((cast) => cast.status !== 'done');
    const risk = open.some((c) => c.risk === 'late') ? 'late'
      : open.some((c) => c.risk === 'tight') ? 'tight'
        : open.some((c) => c.risk === 'ok') ? 'ok' : 'unknown';

    doneCodes.add(block.code);
    shooting.push({
      code: block.code,
      name: info?.[0] || '（存档专有 / 自制通告）',
      category: categoryOf(block.code),
      type, subtype, company,
      firmName: '',
      roles: noticeRoles,
      casts,
      otherCasts,
      startDate: fmtDate(triple[1]),
      endDate: fmtDate(triple[2]),
      startDay, endDay, daysLeft,
      risk,
      offset: block.start,
    });
  }
  shooting.sort((a, b) => {
    const rank: Record<ShootingRisk, number> = { late: 0, tight: 1, unknown: 2, ok: 3 };
    if (rank[a.risk] !== rank[b.risk]) return rank[a.risk] - rank[b.risk];
    return (Number.isFinite(a.endDay) ? a.endDay : Infinity) - (Number.isFinite(b.endDay) ? b.endDay : Infinity);
  });

  // 作品数不需要在这里修正：游戏自己的统计（状态块 +248）本来就只算已完成的
  // 通告，Auto 里陈奕夫在拍 SH067、萧依莉在拍 SH068 都没被算进去。

  // 自制通告及其它：CaseCreate 里列出来的、玩家自己出品的通告。名字要从静态
  // 表查（data1 那份才全），天数 / 档期 / 接演记录来自 Case 段的第一块。
  const nameOfArtist = new Map(artistDirectory.map((entry) => [entry.id, entry.name]));
  const genderOfArtist = new Map(artistDirectory.map((entry) => [entry.id, entry.gender]));
  const groupRecords = teams.map((team) =>
    buildGroupRecord(team, (id) => nameOfArtist.get(id) ?? `编号${id}`));
  const selfMade: SelfMadeNotice[] = parseCaseCreate(view, blocks).map((code, index) => {
    const info = tables.cases[code];
    const [name = '', type = '', subtype = '', company = ''] = info ?? [];
    const noticeRoles = roles.filter((role) => role.code === code);
    // 同一编码在 Case 段常常留着好几块（历次接演各一块），第一块就是游戏
    // 通告列表里显示的那条，天数与档期也取它。
    const block = codeBlocks.find((item) => item.code === code) ?? null;
    const rawDays = block ? view.getUint32(block.start + 24, true) : 0;
    const length = noticeRoles
      .map((role) => lengthOf(code, info, role.role))
      .find((hit): hit is number[] => Boolean(hit)) ?? null;
    // 档期：块里第一个日期是开拍（周一），第二个是杀青；后两个是上档 / 下档，
    // 不参与状态判断。开拍不是周一的块一律当没档期，宁可不显示也不猜。
    const stamps = block ? readSelfMadeDates(view, block.start, block.end) : [];
    const start = stamps[0] && stamps[0].w === 1 && stamps[1] ? stamps[0] : null;
    const finish = start ? stamps[1] : null;
    const startDay = start ? start.day : NaN;
    const endDay = finish ? finish.day : NaN;
    const casts = block
      ? readSelfMadeCasts(
        view, block.start, block.end, mineIds, nameOfArtist, genderOfArtist, noticeRoles,
        (role) => ((role ? lengthOf(code, info, role.role) : null) ?? length)?.[0] ?? 0,
      )
      : [];
    // 团体通告（角色名带「團體」）签的是整个团，不是团长一个人：表里写团名，
    // 天数仍算在这位接演艺人（一般就是团长）身上。
    for (const cast of casts) {
      if (!cast.role || !isGroupRole(cast.role)) continue;
      const group = groupRecords.find((item) => item.memberIds.includes(cast.artistId));
      if (group) {
        cast.group = {
          name: group.name,
          leaderName: group.leaderName,
          memberNames: group.memberNames,
        };
      }
    }
    let status: SelfMadeStatus = 'unknown';
    if (start && finish && Number.isFinite(today)) {
      status = today < startDay ? 'pending' : today <= endDay ? 'shooting' : 'done';
    }
    // 一个人都没接（连对手公司的都没有）就只能是「未开拍」—— 档期只是挂在
    // 通告列表上的排期，没人进组就谈不上拍摄中，更谈不上已完成。
    if (casts.length === 0) status = 'pending';
    else if (status === 'done') {
      // 档期过完 = 作品已经杀青发布，进度一律按拍满处理。存档里的
      // 「已完成 / 还差」是杀青那一刻的快照，发布之后不会再回写：CD701
      // 从 Story0006 到 Auto 始终是 22/25，实际早已发布；结局存档更是把
      // 已完成清成 0（Ending0004 全是 0）。所以这里既补 0 也补「不满」，
      // 否则一条拍完的戏会显示「0 / 45 还差 45」或「22 / 25 还差 3」。
      // 不能因为进度没满就判「已逾期」——那是拿快照当最终状态。
      for (const cast of casts) {
        if (cast.workDays > 0) {
          cast.doneDays = cast.workDays;
          cast.needDays = 0;
        }
      }
    }
    return {
      seq: index + 1,
      code,
      name: name || '（自制通告）',
      category: categoryOf(code),
      type, subtype, company,
      days: rawDays > 0 && rawDays < 400 ? rawDays : 0,
      daysPerWeek: length?.[1] ?? 0,
      roles: noticeRoles,
      casts,
      startDate: start ? fmtDate(start) : '',
      endDate: finish ? fmtDate(finish) : '',
      startDay, endDay,
      daysLeft: Number.isFinite(endDay) && Number.isFinite(today) ? endDay - today : NaN,
      daysToStart: Number.isFinite(startDay) && Number.isFinite(today) ? startDay - today : NaN,
      status,
      offset: block?.start ?? 0,
    };
  });

  // 通告记录表里的角色槽是「通告统计」角色的真源，建索引供作品明细优先取用。
  const workRoleIndex = buildWorkRoleIndex(archiveNotices);

  // 明细改用每位艺人状态块后面的完整参与清单；记事表只剩 97 条，苏嫚君
  // 官方 8 部电视在记事表里只有 5 条，用它当明细必然对不上「通告统计」。
  // 日期则从整张记事表按作品编码补（不按艺人），避免发行记录挂在别人名下。
  const workIndex = buildWorkDateIndex(view, bytes.length);
  const historyWorks = parseWorkHistory(
    view, artists, tables.cases, workIndex, selfMade, artistEnd, rolesByCode, tables.stars,
    workRoleIndex,
  );
  const works = historyWorks.length > 0 ? historyWorks : diaryWorks;

  // 自制通告的个人作品已经进参与清单（CD701 有朋自遠方來就在里面），
  // 不再从 CaseCreate 另补一份——TV701 那种只留在记事表、没进官方统计的
  // 记录曾经让 hover 比「通告统计」多一条。团体唱片仍需从杀青记录补。
  const knownGroupCodes = new Set(groupWorks.map((work) => work.workCode));
  const extraGroupWorks: GroupWork[] = [];
  for (const notice of selfMade) {
    if (notice.status !== 'done' || !Number.isFinite(notice.endDay)) continue;
    const noticeIndex = WORK_CODE_PREFIX.indexOf(notice.code.slice(0, 2));
    if (noticeIndex !== 2 || notice.subtype !== '團體') continue;
    if (knownGroupCodes.has(notice.code)) continue;
    const cast = notice.casts.find((item) => item.mine) ?? notice.casts[0];
    if (!cast) continue;
    const [year, month, day] = notice.endDate.split('/').map(Number);
    if (!year || !month || !day) continue;
    knownGroupCodes.add(notice.code);
    extraGroupWorks.push({
      date: notice.endDate,
      year, month, day,
      workCode: notice.code,
      workName: notice.name || tables.cases[notice.code]?.[0] || notice.code,
      company: notice.company || tables.cases[notice.code]?.[3] || '',
      artistId: cast.artistId,
    });
  }
  // 悬停清单按「发生时间」正序排：有日期的先看年/月/日；没有日期的占位
  // 用缺失序号放在开头（早期作品），再退回参与清单原始顺序。
  const sortKey = (w: WorkRecord) => {
    if (w.year > 0) return w.year * 10000 + w.month * 100 + w.day;
    if (w.seq && w.seq >= 1) return -(1000000 - w.seq);
    return 900000 + (w.order ?? 0);
  };
  const sortedWorks = [...works].sort(
    (a, b) => sortKey(a) - sortKey(b) || a.workCode.localeCompare(b.workCode),
  );
  // 显示出来的条数必须和「通告统计」上的数字一致。参与清单偶尔比官方多
  // 一条（未杀青的自制通告、重复版本）或漏几条（早期主持工作），多的裁掉，
  // 缺的补「未留存明细」占位，绝不编作品名。占位的 seq 取明细里没出现的序号。
  const allWorks: WorkRecord[] = [];
  for (const artist of artists) {
    for (let noticeIndex = 0; noticeIndex < 5; noticeIndex += 1) {
      const list = sortedWorks.filter(
        (work) => work.artistId === artist.roleId && work.noticeIndex === noticeIndex,
      );
      const official = artist.noticeCounts[noticeIndex] ?? list.length;
      const kept = list.slice(Math.max(0, list.length - official));
      allWorks.push(...kept);
      const usedSeqs = new Set(kept.map((w) => w.seq).filter((s): s is number => !!s && s >= 1));
      let missing = 1;
      for (let k = kept.length; k < official; k += 1) {
        while (usedSeqs.has(missing)) missing += 1;
        const seq = missing++;
        allWorks.push({
          date: '', year: 0, month: 0, day: 0,
          workCode: '', workName: '（存档未留存明细）', company: '',
          artistId: artist.roleId, noticeIndex, role: '',
          order: 900000 + noticeIndex * 1000 + k,
          seq,
        });
      }
    }
  }
  allWorks.sort((a, b) => sortKey(a) - sortKey(b) || a.workCode.localeCompare(b.workCode));
  const allGroupWorks = [...groupWorks, ...extraGroupWorks].sort(
    (a, b) => dayNumber(a.year, a.month, a.day) - dayNumber(b.year, b.month, b.day)
      || a.workCode.localeCompare(b.workCode),
  );
  const producerRecords = parseProducerRecords(view, bytes);

  return {
    saveName,
    saveSize: bytes.length,
    readAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    blocks,
    roleRecordCount: roles.length,
    notices,
    shooting,
    selfMade,
    artists,
    friendship,
    producerFriendship: producerRecords.friendship,
    producerNames: producerRecords.names,
    producerProjects: producerRecords.projects,
    artistDirectory,
    signedArtistIds,
    teams,
    roster,
    currentDate,
    company,
    awards,
    events,
    groupWorks: allGroupWorks,
    works: allWorks,
    archiveNotices,
    batches,
    nextUpdate,
    unknownCodes: [...new Set(unknownCodes)],
    items,
    scenes,
  };
}

/** Shortfall of one artist against one role's rolled thresholds. */
export interface MatchResult {
  artistIndex: number;
  artistName: string;
  /** false when the role's gender rules the artist out entirely. */
  eligible: boolean;
  canAccept: boolean;
  /** 社交门槛差值带 social 标记，UI 用它把隐藏条件和九项数值换成不同颜色。 */
  gaps: { attr: string; need: number; have: number; diff: number; social?: boolean }[];
  missing: number;
}

export function matchRole(
  role: RoleRecord,
  artist: ArtistStats,
  artistName: string,
  gender: Gender = 'any',
): MatchResult {
  const gaps: MatchResult['gaps'] = ATTRS
    .filter((attr) => role.values[attr])
    .map((attr) => {
      const need = role.values[attr];
      const have = artist.abilities[ATTRS.indexOf(attr)] ?? 0;
      return { attr, need, have, diff: need - have };
    });
  // 社交门槛与九项能力一起决定能否接演：叛逆/性感/亲和直接比艺人 social 前三项。
  for (const [key, attr, idx] of [['rebellion', '叛逆', 0], ['sexy', '性感', 1], ['affinity', '亲和', 2]] as const) {
    const need = role.social[key];
    if (!need) continue;
    const have = artist.social[idx] ?? 0;
    gaps.push({ attr, need, have, diff: need - have, social: true });
  }
  const missing = gaps.filter((gap) => gap.diff > 0);
  const eligible = canTakeRole(role, gender);
  return {
    artistIndex: artist.index,
    artistName,
    eligible,
    canAccept: eligible && missing.length === 0,
    gaps,
    missing: missing.length,
  };
}

/** CSV export, matching the columns shown in the reader. */
export function toCsv(result: ParseResult): string {
  const lines = [[
    '游戏日期', '通告编号', '通告名称', '大类', '节目类型', '制作公司',
    '开放接取', '停止接取', '距截止(天)', '执行开始', '执行结束', '执行天数',
    '工作天数', '每周上限',
    '已执行天数', '剩余天数', '角色', '预约艺人', '难度(星)', '所需数值', '静态等级',
  ]];
  for (const notice of result.notices) {
    for (const role of notice.roles) {
      const req = role.requirements;
      lines.push([
        result.currentDate?.text ?? '', notice.code, notice.name,
        notice.category, notice.type, notice.company,
        notice.openDate, notice.deadline,
        Number.isFinite(notice.daysToDeadline) ? String(notice.daysToDeadline) : '',
        notice.periodStart, notice.periodEnd, String(notice.execDays),
        notice.workDays ? String(notice.workDays) : '',
        notice.daysPerWeek ? String(notice.daysPerWeek) : '',
        String(notice.executedDays), String(notice.remainingDays),
        role.role, role.reservedBy, String(role.star),
        req.map((x) => `${x.attr}${x.value}`).join(' '),
        req.filter((x) => x.staticGrade).map((x) => `${x.attr}${x.staticGrade}`).join(' '),
      ]);
    }
  }
  return '\uFEFF' + lines
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
}
