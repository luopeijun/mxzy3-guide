/** 甜蜜乐章 `.sav` 存档解析（第一步：游戏时间 / 公司 / 艺人卡片）。

 *  甜蜜乐章存档与原版三合一完全不同：文件头 4 字节是「解压后长度」，
 *  随后是一段 zlib（78 9c）压缩流。解压后才是真正的存档数据。
 *
 *  已确认的定长字段（偏移都指解压后的字节流）：
 *   - 普通档：主角名 @0x04、公司名 @0x19、签约槽 @0x34/@0x38/@0x3c、
 *     游戏时间 @0x40，都是 NUL 结尾 Big5 或 int32。
 *   - 结局档（Ending*.sav）在 @0x04 写 1，签约槽和游戏时间被提前到
 *     @0x08/@0x0c/@0x10 与 @0x14..@0x20，普通头部整体后移 84B（0x54）：
 *     主角名 @0x58、公司名 @0x6d。按普通档偏移读会得到乱码和空艺人列表，
 *     必须先按这个标记切换布局。
 *   - 艺人当前属性块：`id` 在 +16，后接 `[x][1][0]`，九项 int32 能力从 +32 起
 *     （存档 ×10）；+68/+72 是压力/疲劳，+80 起 5 项是叛逆/性感/亲和/人气/
 *     曝光（后期存档人气会被 capped 到 999999，不能按 10000 拒绝整块），
 *     +264 起 8 项是电视/电影/唱片/广告/主持/舞台剧/走秀/演唱会的作品数；
 *     +332/+348 是两个 [年,月,日,星期] 合约日期四元组，+364 签约金，+368 分红
 *     （主角到期年 4049 是游戏里的长期合约标记，照样显示）。
 *     +20 是称号编号（与主站 Nickname.tab 同一套编号，0 = 还没有称号），
 *     +76 是状态编号（5 = 生病、7 = 正常；这也是无标记块的识别依据）；
 *     块有两种形态：带 327680 标记，或不带标记但 +76 为 5/7（沈惟真、主角
 *     常见）；只认标记会把这类艺人的压力/疲劳读成 0。
 *   - 友好度 / 礼物数：存档头部 16B 记录 `[友好度][送礼数][256|257][艺人编号]`，
 *     记录按 200B 步长排布，257 表示已签约；与主站同一套语义。
 *   - 公司形象 / 知名度 / 公关在 `Firm` 段：标记 `[4][\"Firm\\0\"]`，随后
 *     `[公司数][编号][名字字节数][Big5 名字][NUL][知名度][公关][0]`，
 *     编号 1 是我方；知名度与公关存档 ×10，界面按整数显示（向下取整）。
 *   - 艺人成绩（与主站同构的记事表）：`[条数][108]`，每条
 *     `[年][月][日][类型][事项][艺人编号]...[8B 作品编码]`。得奖是类型 5、
 *     事项 21..53；举办活动是类型 6、事项 61..63（歌友會/影友會/演唱會），
 *     规模在 +36、团体场看 +24 非零，团体名写在 +76。单份存档同时保留
 *     2008/2009/2010 的记录，年份取这里。
 *   - 我方团体与主站同构：`[编号101+][名字节长度][Big5 名字]`，名字后
 *     +28/+32 是成员编号（第 0 个队长），+24 是团体唱片数，尾部有「Invaid」
 *     类标记。52 号档是 101 稀奇古怪，成员 15 慕容和希 / 14 姚子奇。
 *   - 得奖记录表（艺人事件簿尾部）：15 条 48B 定长记录 + 一条「從缺」占位；
 *     只保留最近一年，用作艺人成绩表缺失时的兜底。
 *   - 筹备中通告：`CaseFirm` 段 `[count][seq u32][公司槽 u32][5 u32][5B 通告码]`
 *     每条 18B；通告本体在 `Case`..`CaseEnd` 段里按 `[4][5B 通告码]` 定位，
 *     +10 大类、+14 长度/效果子类（查 Length.dat）、+18 界面题材类型（查 XxxType.dat），
 *     +22 是名字字节数、+26 起 Big5 名字，
 *     角色槽以 `[1][6B 角色码][类型 u32][星级 u32]...[9 项门槛 u32]` 定长排布，
 *     尾部三组日期四元组是开放 / 开拍 / 杀青（停止接取＝开拍前一日）。
 *     公司名、角色名、工作天数来自烘焙的 `sweet/case-tables.json`。
 *   - 宣传中通告：同一 `Case` 段里 +10 为 ScheduleClass.dat 宣传编号的本体
 *     （10/15/16/20/21/22，甜蜜乐章另有 26/31）；接演槽从第一个角色槽 +777
 *     起，每 24B 一组 `[艺人编号][宣传天数]`。 */


export const SWEET_ABILITY_LABELS = [
  '演技', '口才', '歌艺', '名气', '仪态', '动感', '体能', '才智', '自信',
] as const;

/** 甜蜜乐章比原版多舞台剧 / 走秀 / 演唱会，通告统计共 8 类。 */
export const SWEET_NOTICE_LABELS = [
  '电视', '电影', '唱片', '广告', '主持', '舞台剧', '走秀', '演唱会',
] as const;

/** 烘焙自 Data/AwardItem.dat 记录 1..15，顺序即得奖记录表的行序。 */
export const SWEET_AWARD_LABELS = [
  '最佳新人', '最佳演唱人', '最佳团体', '年度专辑',
  '最佳男主角', '最佳女主角', '最佳男配角', '最佳女配角',
  '最佳男演员', '最佳女演员', '最佳主持人', '年度戏剧',
  '最上镜头', '最佳模特儿', '最佳代言人',
] as const;

/** 与主站事项编号同序，让称号升级的奖项门槛可以直接按编号计数。 */
const SWEET_AWARD_IDS = [21, 22, 23, 24, 31, 32, 33, 34, 41, 42, 43, 44, 51, 52, 53];

/** 艺人成绩记事里的事项编号，沿用主站 21..53 那一套。 */
const SWEET_DIARY_AWARD_NAMES: Record<number, string> = {
  21: '最佳新人', 22: '最佳演唱人', 23: '最佳团体', 24: '年度专辑',
  31: '最佳男主角', 32: '最佳女主角', 33: '最佳男配角', 34: '最佳女配角',
  41: '最佳男演员', 42: '最佳女演员', 43: '最佳主持人', 44: '年度戏剧',
  51: '最上镜头', 52: '最佳模特儿', 53: '最佳代言人',
};
const SWEET_DIARY_STRIDE = 108;
const SWEET_DIARY_AWARD_KIND = 5;
const SWEET_DIARY_CEREMONY: Record<number, string> = {
  2: '金曲奖', 3: '金像奖', 4: '金钟奖', 5: '金星奖',
};
/** 23 是团体荣誉，24 / 44 是公司作品奖；和主站同一套分流。 */
const SWEET_DIARY_GROUP_AWARD_IDS = new Set([23]);
const SWEET_DIARY_COMPANY_AWARD_IDS = new Set([24, 44]);
/** 与主站一致：类型 6 才是「举办活动」，61 歌友會 / 62 影友會 / 63 演唱會。 */
const SWEET_DIARY_EVENT_KIND = 6;
const SWEET_DIARY_EVENT_NAMES: Record<number, string> = {
  61: '歌友會', 62: '影友會', 63: '演唱會',
};
const SWEET_DIARY_EVENT_SCALE = ['', '大型', '中型', '小型'];

/** 参与清单里的大类编号 -> 通告统计下标；10/15/16/20/21/22/26/31 是同作品变体。 */
const SWEET_WORK_CLASS_INDEX: Record<number, number> = {
  1: 3, 2: 0, 3: 1, 4: 2, 5: 4, 6: 5, 7: 6,
};
/** 记事表事项编号 -> 通告统计下标；+36 的「第 N 部」序号只对发行记录有效。 */
const SWEET_DIARY_WORK_TYPE: Record<number, number> = {
  11: 0, 12: 1, 13: 2, 14: 3, 15: 4, 16: 5, 17: 6,
};
/** 参与清单末字段：5 是标准记录，10/15/... 是同作品的版本记录；
 *  同一个作品码只出现版本记录时仍是真作品（如 Story0008 的 TVACY），按码去重后算一次。 */
const SWEET_WORK_RECORD_TAILS = new Set([5, 10, 15, 16, 20, 21, 22, 26, 31]);

export interface SweetAward {
  /** 事项编号（21..53），与主站同一套；称号升级的额外奖项按它计数。 */
  awardId: number;
  year: number;
  month: number;
  day: number;
  ceremony: string;
  label: string;
  /** 得主名字：个人奖是艺人，团体奖是团名，公司奖是公司名。 */
  winner: string;
  /** 作品名；个人奖也会带作品，页面只给团体 / 年度作品奖显示。 */
  work: string;
  workCode: string;
  artistId: number;
  /** 与公司奖、个人奖互斥：只挂团体卡。 */
  group: boolean;
  /** 与主站一致：公司奖单列，个人奖挂到艺人卡。 */
  company: boolean;
}

/** 「艺人成绩」记事里的举办活动，团体场只挂团体卡。 */
export interface SweetEvent {
  year: number;
  month: number;
  day: number;
  date: string;
  /** 可直接显示，例如「大型團體演唱會」。 */
  label: string;
  kind: number;
  scale: number;
  group: boolean;
  /** 团体场的记事内嵌团名，读不到时由成员编号回查团体。 */
  groupName: string;
  artistId: number;
}

/** 通告统计悬停里的一条作品，和主站 WorkRecord 同一套口径。 */
export interface SweetWorkRecord {
  date: string;
  year: number;
  month: number;
  day: number;
  workCode: string;
  workName: string;
  company: string;
  artistId: number;
  /** 对应 SWEET_NOTICE_LABELS 的下标 0..7。 */
  noticeIndex: number;
  role: string;
  /** 参与清单里的原始顺序，只用于排序。 */
  order: number;
  /** 游戏内「第 N 部」序号，给未留存明细的占位排回正确位置。 */
  seq?: number;
}

/** 我方团体：成员编号第 0 个是队长，名字来自存档。 */
export interface SweetTeam {
  code: number;
  name: string;
  memberIds: number[];
  memberNames: string[];
  leaderId: number;
  leaderName: string;
  workCount: number;
  /** 团体唱片明细，供团体卡「通告统计」hover 展示。真源＝记事表事项 13 且
   *  `+24`（团体代表艺人编号）> 0 的唱片发行记录，按 `+24` 归属到所属团体。 */
  works: SweetWorkRecord[];
  /** 团体名气：存档 nameEnd+4 是累加值，除以 1000 取整即游戏界面显示值。 */
  fame: number;
  /** 团体人气：存档 nameEnd+8 是累加值，除以 1000 取整即游戏界面显示值。 */
  popularity: number;
}

/** 筹备中通告的一行：九项门槛里只留非 0 项，展示成「所需数值」胶囊。 */
export interface SweetNoticeRequirement {
  attr: string;
  value: number;
}

export interface SweetNoticeRole {
  /** 角色码，例如 `TVA111`，也是表格里的稳定 key。 */
  code: string;
  role: string;
  roleType: number;
  star: number;
  requirements: SweetNoticeRequirement[];
  workDays: number;
  daysPerWeek: number;
  /** 通告记录尾部角色预约槽里读到的艺人编号，空表示无人预约。 */
  reservedBy: string;
}

export interface SweetNotice {
  seq: number;
  code: string;
  name: string;
  category: string;
  /** 大类下的子类型，如「爱情偶像剧」「说话B」，与主站类型列同位置。 */
  type: string;
  company: string;
  openDate: string;
  deadline: string;
  startDate: string;
  endDate: string;
  daysToDeadline: number;
  daysToStart: number;
  status: 'open' | 'closing' | 'upcoming' | 'expired';
  roles: SweetNoticeRole[];
}

/** 从真实游戏目录烘焙的通告静态表；缺表时解析器仍尽量用存档自身信息。 */
export interface SweetCaseTables {
  classes?: Record<string, string>;
  roles?: Record<string, string>;
  companyBySeq?: Record<string, string>;
  /** 通告码末尾三位 -> 制作公司（StudioProduce.dat 的 caseNo）。 */
  companyByCode?: Record<string, string>;
  /** 海外通告按大类取真实公司名（StudioProduce.dat 的海外槽）。 */
  overseasCompanies?: Record<string, string>;
  lengths?: Record<string, [number, number]>;
  cases?: Record<string, string>;
  genders?: Record<string, number>;
  /** `classId|subId` -> 简体子类型名（来自各 XxxType.dat）。 */
  subtypes?: Record<string, string>;
  /** ScheduleClass.dat 的宣传子类编号 -> 简体显示名。 */
  promoKinds?: Record<string, string>;
  /** `code -> [名称, 分类, 说明, 属性行]`，来自甜蜜乐章 Item.dat 烘焙。 */
  items?: Record<string, [string, string, string, string]>;
  /** `code -> [名称, 说明]`，来自甜蜜乐章 Cloth.dat 烘焙。 */
  clothes?: Record<string, [string, string]>;
  /** `code -> 21 个送礼槽位的好感加成`，来自 Item.dat 记录 +48。 */
  gifts?: Record<string, number[]>;
  /** 艺人编号 -> 送礼槽位下标，由甜站偏好礼物清单反推。 */
  giftSlots?: Record<string, number>;
  /** 「國外情報」展示的六座场景显示名 / 存档繁体原名 / 费用，来自 World.dat。 */
  scenes?: SweetScene[];
  /** 制作人编号 -> [显示名, 六类分组 key]，来自 MapRole + StudioProduce 烘焙。 */
  producers?: Array<{ code: number; name: string; group: string }>;
}

/** 存档里一座国际场景的解锁状态；费用与显示名来自 World.dat 烘焙表。 */
export interface SweetScene {
  name: string;
  /** World.dat / 存档里的繁体原名，用来对齐解锁记录。 */
  rawName: string;
  cost: number;
  unlocked: boolean;
}

/** 存档 Item 段里的一件道具：`[编号][状态位][数量][附字段]`。
 *  存档本身不带名称，展示文本由 case-tables.json 的 Item.dat 表补齐。 */
export interface SweetOwnedItem {
  code: number;
  flag: number;
  quantity: number;
  meta: number;
  name?: string;
  category?: string;
  desc?: string;
  stats?: string;
}

/** 宣传活动里一位旗下艺人的一行：宣传天数来自接演槽，角色名来自本体角色槽。 */
export interface SweetPromoCast {
  artistId: number;
  artistName: string;
  role: string;
  doneDays: number;
}

/** 宣传活动：作品本体衍生出的宣传 / 首映 / MTV / 签名会记录。 */
export interface SweetPromoNotice {
  code: string;
  name: string;
  category: string;
  kind: string;
  /** 主打宣传（电视剧/电影/唱片/舞台剧/时装秀）参与档期过滤。 */
  mainKind: boolean;
  startDate: string;
  endDate: string;
  endDay: number;
  casts: SweetPromoCast[];
}

/** 等待上市的一位我方参演者，字段与拍摄中接演记录同源。 */
export interface SweetWaitingCast {
  artistId: number;
  artistName: string;
  role: SweetNoticeRole | null;
  doneDays: number;
  pay: number;
  /** pay=0 时的区分：zero＝拍摄时已签约、明确 0 元；unsigned＝拍摄时尚未签约、无数据。 */
  payStatus?: 'zero' | 'unsigned';
}

/** 等待上市的作品：已杀青、还没到发行日，只列我方艺人/团体参与的角色行。 */
export interface SweetWaitingNotice {
  code: string;
  name: string;
  category: string;
  type: string;
  company: string;
  startDate: string;
  endDate: string;
  saleStart: string;
  saleEnd: string;
  casts: SweetWaitingCast[];
}

/** 热卖中：与等待上市同一套本体字段，只把日期口径换成已上档、未下档。 */
export type SweetHotNotice = SweetWaitingNotice;

/** 已完成：与等待上市同一套本体字段，只把日期口径换成已过下档日。 */
export type SweetDoneNotice = SweetWaitingNotice;

/** 自制通告的档期状态，和主站同口径：完全由本体的开拍日 / 杀青日推出来。 */
export type SweetSelfMadeStatus = 'pending' | 'shooting' | 'done' | 'unknown';

/** 一位接演艺人在这条自制通告上的记录；对手公司的演员占角色格但不上表。 */
export interface SweetSelfMadeCast {
  artistId: number;
  artistName: string;
  role: SweetNoticeRole | null;
  pay: number;
  mine: boolean;
  doneDays: number;
  needDays: number;
  workDays: number;
  group: { name: string; leaderName: string; memberNames: string[] } | null;
}

/** CaseCreate 段里的自制作品：玩家自己出品，不进 CaseFirm，有自己的一套档期。 */
export interface SweetSelfMadeNotice {
  seq: number;
  code: string;
  name: string;
  category: string;
  type: string;
  company: string;
  /** CaseCreate 里存的档期长度编号，0 表示没读到；界面的天数看接演记录。 */
  days: number;
  /** Length 表的每周上限，0 表示查不到。 */
  daysPerWeek: number;
  roles: SweetNoticeRole[];
  casts: SweetSelfMadeCast[];
  startDate: string;
  endDate: string;
  startDay: number;
  endDay: number;
  daysLeft: number;
  daysToStart: number;
  status: SweetSelfMadeStatus;
}

/** 拍摄中风险档位，沿用主站两档口径：排不下=违约、余量 ≤5 天=逾期风险。 */
export type SweetShootingRisk = 'ok' | 'tight' | 'late' | 'unknown';
export type SweetShootingStatus = 'pending' | 'shooting' | 'done';

/** 拍摄中的一位我方艺人：进度、酬劳按「通告 × 艺人」单独记。
 *  doneDays = successDays + perfectDays（游戏界面的「完成」），失败天数不计入完成。 */
export interface SweetShootingCast {
  artistId: number;
  artistName: string;
  role: SweetNoticeRole | null;
  workDays: number;
  daysPerWeek: number;
  doneDays: number;
  successDays: number;
  perfectDays: number;
  failDays: number;
  pay: number;
  needDays: number;
  canShootDays: number;
  risk: SweetShootingRisk;
  status: SweetShootingStatus;
}

/** 同一部戏的对手演员 / 空缺角色格，进度酬劳没有真值。 */
export interface SweetShootingOtherCast {
  artistId: number | null;
  artistName: string;
  role: SweetNoticeRole | null;
  vacant: boolean;
}

/** 拍摄中通告：已接取、还没杀青，接取记录是真源。 */
export interface SweetShootingNotice {
  code: string;
  name: string;
  category: string;
  type: string;
  company: string;
  startDate: string;
  endDate: string;
  startDay: number;
  endDay: number;
  daysLeft: number;
  roles: SweetNoticeRole[];
  casts: SweetShootingCast[];
  otherCasts: SweetShootingOtherCast[];
  risk: SweetShootingRisk;
  offset: number;
}

export interface SweetContract {
  signDate: string;
  expireDate: string;
  signingBonus: number;
  dividend: number;
}

export interface SweetArtistCard {
  id: number;
  name: string;
  /** 杜云芊固定占我方一位，这块没有 327680 标记，靠编号 1 + 结构定位。 */
  isProtagonist: boolean;
  /** 九项能力，存档 ×10，这里已 ÷10。 */
  abilities: number[];
  friendship: number;
  gifts: number;
  stress: number;
  fatigue: number;
  /** 叛逆 / 性感 / 亲和 / 人气 / 曝光。 */
  social: number[];
  /** +20 的游戏称号编号；0 = 还没有称号。 */
  titleId: number;
  /** 称号名来自 case-tables.json 的 titles，读不到时页面回退显示编号。 */
  title: string;
  /** +76 的状态：5 生病 / 7 正常，读不到时为空串。 */
  condition: string;
  noticeCounts: number[];
  /** 与主站同样只认合法合约日期；主角或占位块返回 null。 */
  contract: SweetContract | null;
}

export interface SweetSave {
  protagonist: string;
  company: string;
  companyImage: string;
  fame: number;
  pr: number;
  money: number;
  date: { year: number; month: number; day: number; weekday: number };
  signedIds: number[];
  artists: SweetArtistCard[];
  teams: SweetTeam[];
  awards: SweetAward[];
  /** 演唱会 / 影友會 / 歌友會：个人场挂艺人卡，团体场挂团体卡。 */
  events: SweetEvent[];
  /** 通告统计悬停用的作品明细；每位艺人每类条数与官方统计对齐。 */
  works: SweetWorkRecord[];
  /** 筹备中通告：CaseFirm 当期可接取列表 + Case 段的通告本体。 */
  notices: SweetNotice[];
  /** 拍摄中通告：已接取、还没杀青，接取记录是真源。 */
  shooting: SweetShootingNotice[];
  /** 宣传中通告：作品本体衍生出的宣传记录，按作品分组展示。 */
  promo: SweetPromoNotice[];
  /** 等待上市通告：已杀青、还没到发行日的作品，只列我方参演。 */
  waiting: SweetWaitingNotice[];
  /** 热卖中通告：已到发行日、还没下档的作品，只列我方参演。 */
  hot: SweetHotNotice[];
  /** 已完成通告：已过发行下档日的作品，只列我方参演。 */
  done: SweetDoneNotice[];
  /** 自制通告及其他：CaseCreate 段里玩家自己出品的作品。 */
  selfMade: SweetSelfMadeNotice[];
  /** 存档 Item 段记录的道具清单（含数量为 0 的条目，页面自行过滤）。 */
  items: SweetOwnedItem[];
  /** 存档 Clothes 段记录的衣服清单（数量即拥有标志）。 */
  clothes: SweetOwnedItem[];
  /** 「國外情報」六座场景的解锁标志；费用 / 显示名来自 World.dat。 */
  scenes: SweetScene[];
  /** 制作人编号 -> 友好度（存档友好度表制作人段）。 */
  producerFriendship: Record<number, number>;
  /** 制作人清单（编号 / 名字 / 分组），来自烘焙表，随 save 一起带给页面。 */
  producers: Array<{ code: number; name: string; group: string }>;
}

const BLOCK_MARK = 0x00050000; // 327680，艺人属性块头标记
/** 艺人块 +76 的状态编号；全量存档只出现 5 / 7，5 的艺人疲劳普遍很高。 */
const SWEET_CONDITION_NAMES: Record<number, string> = { 5: '生病', 7: '正常' };
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
// 社交五项里只有「人气」会被游戏 capped 到 999999（后期存档常见），其余仍 ≤10000。
const SOCIAL_LIMIT = 10000;
const POPULARITY_LIMIT = 999999;

type ArtistValues = Omit<SweetArtistCard, 'id' | 'name' | 'isProtagonist' | 'friendship' | 'gifts'>;

const EMPTY_VALUES: ArtistValues = {
  abilities: Array(9).fill(0),
  stress: 0,
  fatigue: 0,
  social: Array(5).fill(0),
  titleId: 0,
  title: '',
  condition: '',
  noticeCounts: Array(8).fill(0),
  contract: null,
};

function readI32(view: DataView, offset: number): number {
  return view.getInt32(offset, true);
}

/** NUL 结尾的 Big5 字符串。 */
function readBig5(bytes: Uint8Array, offset: number, limit = 64): string {
  let end = offset;
  const stop = Math.min(offset + limit, bytes.length);
  while (end < stop && bytes[end] !== 0) end += 1;
  if (end === offset) return '';
  try {
    return new TextDecoder('big5').decode(bytes.subarray(offset, end));
  } catch {
    return '';
  }
}

/** zlib 解压：前 4 字节是解压后长度，随后是 78 9c 压缩流。 */
async function inflateSave(file: File): Promise<Uint8Array> {
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const expected = new DataView(header.buffer).getUint32(0, true);
  const compressed = file.slice(4);
  const stream = new Blob([compressed]).stream()
    .pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (expected && raw.byteLength !== expected) {
    throw new Error(`存档解压长度不符：期望 ${expected}，实得 ${raw.byteLength}`);
  }
  return raw;
}

/** `Firm` 段：编号 1 是我方，名字即公司形象文案；知名度/公关存档 ×10。 */
function readCompany(bytes: Uint8Array, view: DataView): {
  image: string; fame: number; pr: number;
} {
  const marker = [0x04, 0x00, 0x00, 0x00, 0x46, 0x69, 0x72, 0x6d, 0x00]; // [4]"Firm\0"
  let start = -1;
  for (let i = 0; i + marker.length <= bytes.length; i += 1) {
    let match = true;
    for (let k = 0; k < marker.length; k += 1) {
      if (bytes[i + k] !== marker[k]) { match = false; break; }
    }
    if (match) { start = i; break; }
  }
  const empty = { image: '', fame: 0, pr: 0 };
  if (start < 0) return empty;

  let offset = start + marker.length;
  const count = readI32(view, offset);
  offset += 4;
  if (count < 1 || count > 50) return empty;

  let result = empty;
  let found = false;
  for (let index = 0; index < count; index += 1) {
    const id = readI32(view, offset);
    offset += 4;
    const nameLength = readI32(view, offset);
    offset += 4;
    if (nameLength < 0 || nameLength > 64 || offset + nameLength + 13 > bytes.length) return empty;
    const name = readBig5(bytes, offset, nameLength);
    offset += nameLength;
    if (bytes[offset] === 0) offset += 1;
    const rawFame = readI32(view, offset);
    offset += 4;
    const rawPr = readI32(view, offset);
    offset += 4;
    const tail = readI32(view, offset);
    offset += 4;
    if (id !== index + 1 || tail !== 0 || rawFame < 0 || rawPr < 0) return empty;
    if (id === 1) {
      result = { image: name, fame: Math.floor(rawFame / 10), pr: Math.floor(rawPr / 10) };
      found = true;
    }
  }
  return found ? result : empty;
}

interface ArtistBlock {
  values: ArtistValues;
  score: number;
  /** 标记块最可信；无标记但 +76 为 5/7 的是真块，优先于普通噪声。 */
  priority: number;
}

/** 当前合约：块尾两个日期四元组 + 签约金 + 分红；主角用 4049 表示长期合约。 */
function readContract(
  view: DataView, offset: number, bytesLength: number, allowFarExpire = false,
): SweetContract | null {
  if (offset + 372 > bytesLength) return null;
  const sy = readI32(view, offset + 332);
  const sm = readI32(view, offset + 336);
  const sd = readI32(view, offset + 340);
  const ey = readI32(view, offset + 348);
  const em = readI32(view, offset + 352);
  const ed = readI32(view, offset + 356);
  const signingBonus = readI32(view, offset + 364);
  const dividend = readI32(view, offset + 368);
  const validDate = (y: number, m: number, d: number) =>
    y >= 2000 && y <= (allowFarExpire ? 9999 : 2100) && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  if (!validDate(sy, sm, sd) || !validDate(ey, em, ed)) return null;
  if (signingBonus < 0 || dividend < 0 || dividend > 100) return null;
  return {
    signDate: `${sy}/${sm}/${sd}`,
    expireDate: `${ey}/${em}/${ed}`,
    signingBonus,
    dividend,
  };
}

/** 读一个艺人属性块的定长数值；越界或形状不对返回 null。 */
function readArtistBlock(
  view: DataView,
  offset: number,
  bytesLength: number,
  titles: Record<string, string>,
  allowFarExpire = false,
): Omit<ArtistBlock, 'priority'> | null {
  const rawAbilities: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    const value = readI32(view, offset + 32 + i * 4);
    if (value < 0 || value > 10000) return null;
    rawAbilities.push(value);
  }
  const stress = readI32(view, offset + 68);
  const fatigue = readI32(view, offset + 72);
  if (stress < 0 || stress > 1000 || fatigue < 0 || fatigue > 1000) return null;
  const social = Array.from({ length: 5 }, (_, i) => readI32(view, offset + 80 + i * 4));
  if (!social.every((value, index) => value >= 0
    && value <= (index === 3 ? POPULARITY_LIMIT : SOCIAL_LIMIT))) return null;
  const noticeCounts = Array.from({ length: 8 }, (_, i) => readI32(view, offset + 264 + i * 4));
  if (!noticeCounts.every((value) => value >= 0 && value <= 9999)) return null;
  const rawTitleId = readI32(view, offset + 20);
  const titleId = rawTitleId > 0 && rawTitleId <= 999 ? rawTitleId : 0;
  return {
    values: {
      abilities: rawAbilities.map((value) => value / 10),
      stress,
      fatigue,
      social,
      titleId,
      title: titleId > 0 ? titles[String(titleId)] ?? '' : '',
      condition: SWEET_CONDITION_NAMES[readI32(view, offset + 76)] ?? '',
      noticeCounts,
      contract: readContract(view, offset, bytesLength, allowFarExpire),
    },
    score: rawAbilities.reduce((sum, value) => sum + value, 0),
  };
}

/** 扫描艺人属性块。标记块优先，其次是无标记但 +76 为 5/7 的真块。 */
function scanArtists(
  bytes: Uint8Array, view: DataView, titles: Record<string, string>,
): Map<number, ArtistValues> {
  const best = new Map<number, ArtistBlock>();
  for (let offset = 0; offset + 296 <= bytes.length; offset += 1) {
    const id = readI32(view, offset + 16);
    if (id < 1 || id > 110 || id === 1) continue;
    if (readI32(view, offset + 24) !== 1 || readI32(view, offset + 28) !== 0) continue;
    const marked = view.getUint32(offset, true) === BLOCK_MARK;
    if (!marked && readI32(view, offset + 76) !== 5 && readI32(view, offset + 76) !== 7) continue;
    const block = readArtistBlock(view, offset, bytes.length, titles);
    if (!block) continue;
    const priority = marked ? 2 : 1;
    const previous = best.get(id);
    if (previous && (previous.priority > priority
      || (previous.priority === priority && previous.score >= block.score))) continue;
    best.set(id, { ...block, priority });
  }
  return new Map([...best].map(([id, block]) => [id, block.values]));
}

/** 主角杜云芊的属性块也可能没有标记，且 +76 不一定是 5/7；取数值和最大的形状匹配块。 */
function scanProtagonist(
  bytes: Uint8Array, view: DataView, titles: Record<string, string>,
): ArtistValues {
  let bestScore = -1;
  let result: ArtistValues = EMPTY_VALUES;
  for (let offset = 0; offset + 296 <= bytes.length; offset += 1) {
    if (readI32(view, offset + 16) !== 1) continue;
    if (readI32(view, offset + 24) !== 1 || readI32(view, offset + 28) !== 0) continue;
    const block = readArtistBlock(view, offset, bytes.length, titles, true);
    if (!block || block.score <= bestScore) continue;
    bestScore = block.score;
    result = block.values;
  }
  return result;
}

/** 作品明细要按艺人块定位参与清单，这里复用上面的块判定，另存块起点。 */
interface SweetArtistLocation {
  id: number;
  offset: number;
  noticeCounts: number[];
}

function scanArtistLocations(bytes: Uint8Array, view: DataView): SweetArtistLocation[] {
  const best = new Map<number, SweetArtistLocation & { priority: number; score: number }>();
  for (let offset = 0; offset + 296 <= bytes.length; offset += 1) {
    const id = readI32(view, offset + 16);
    if (id < 1 || id > 110) continue;
    if (readI32(view, offset + 24) !== 1 || readI32(view, offset + 28) !== 0) continue;
    const marked = view.getUint32(offset, true) === BLOCK_MARK;
    if (!marked && readI32(view, offset + 76) !== 5 && readI32(view, offset + 76) !== 7) continue;
    const block = readArtistBlock(view, offset, bytes.length, {}, id === 1);
    if (!block) continue;
    const priority = marked ? 2 : 1;
    const previous = best.get(id);
    if (id === 1) {
      if (previous && previous.score >= block.score) continue;
    } else if (previous && (previous.priority > priority
      || (previous.priority === priority && previous.score >= block.score))) continue;
    best.set(id, {
      id, offset, noticeCounts: block.values.noticeCounts, priority, score: block.score,
    });
  }
  return [...best.values()]
    .map(({ id, offset, noticeCounts }) => ({ id, offset, noticeCounts }))
    .sort((a, b) => a.offset - b.offset);
}

/** 存档头部的友好度 / 送礼数表，记录 16B、按 200B 步长排布。 */
function scanRelations(view: DataView, bytes: Uint8Array): Map<number, { friendship: number; gifts: number }> {
  const out = new Map<number, { friendship: number; gifts: number }>();
  const limit = Math.min(bytes.length - 16, 10000);
  for (let offset = 0; offset < limit; offset += 1) {
    const friendship = readI32(view, offset);
    if (friendship < 0 || friendship > 999) continue;
    const gifts = readI32(view, offset + 4);
    if (gifts < 0 || gifts > 99) continue;
    const flag = readI32(view, offset + 8);
    if (flag !== 256 && flag !== 257) continue;
    const id = readI32(view, offset + 12);
    if (id < 1 || id > 110 || out.has(id)) continue;
    out.set(id, { friendship, gifts });
  }
  return out;
}

/** 得奖记录表：15 条 48B 记录 + 一条「從缺」；靠尾部占位反查表头。 */
function scanAwards(bytes: Uint8Array, year: number): SweetAward[] {
  const vacancy = [0xb1, 0x71, 0xaf, 0xca]; // Big5「從缺」
  const matchesAt = (offset: number) =>
    offset + vacancy.length <= bytes.length && vacancy.every((b, i) => bytes[offset + i] === b);
  for (let marker = 0; marker + 24 <= bytes.length; marker += 1) {
    if (!matchesAt(marker) || !matchesAt(marker + 20)) continue;
    const start = marker - 15 * 48;
    if (start < 0) continue;
    const rows: SweetAward[] = [];
    let ok = true;
    for (let index = 0; index < 15; index += 1) {
      const offset = start + index * 48;
      if (offset + 48 > bytes.length) { ok = false; break; }
      const winner = readBig5(bytes, offset, 16);
      const work = readBig5(bytes, offset + 20, 16);
      if (!winner || !work || winner === '從缺') { ok = false; break; }
      rows.push({
        awardId: SWEET_AWARD_IDS[index],
        year,
        month: 0,
        day: 0,
        ceremony: index < 4 ? '金曲奖' : index < 8 ? '金像奖' : index < 12 ? '金钟奖' : '金星奖',
        label: SWEET_AWARD_LABELS[index],
        winner,
        work,
        workCode: '',
        artistId: 0,
        group: index === 2,
        company: index === 3 || index === 11,
      });
    }
    if (ok) return rows;
  }
  return [];
}

/** 作品编码：8 字节 ASCII，NUL 结尾。 */
function readCode(bytes: Uint8Array, offset: number, limit = 8): string {
  let code = '';
  for (let i = 0; i < limit && offset + i < bytes.length; i += 1) {
    const byte = bytes[offset + i];
    if (!byte) break;
    if (byte < 0x20 || byte > 0x7e) return '';
    code += String.fromCharCode(byte);
  }
  return /^[A-Z]{2}[0-9A-Z]{3}$/.test(code) ? code : '';
}

/** 艺人成绩表在解压流里不一定 4 字节对齐；全档找 `[条数][108]` 且逐条日期合法的一处。 */
function findSweetDiaryTable(view: DataView, length: number): { offset: number; count: number } | null {
  let best: { offset: number; count: number } | null = null;
  for (let offset = 0; offset + 16 <= length; offset += 1) {
    const count = readI32(view, offset);
    if (count < 1 || count > 400 || readI32(view, offset + 4) !== SWEET_DIARY_STRIDE) continue;
    if (offset + 8 + count * SWEET_DIARY_STRIDE > length) continue;
    let ok = true;
    for (let i = 0; i < count && ok; i += 1) {
      const p = offset + 8 + i * SWEET_DIARY_STRIDE;
      const year = readI32(view, p);
      const month = readI32(view, p + 4);
      const day = readI32(view, p + 8);
      const kind = readI32(view, p + 12);
      const thing = readI32(view, p + 16);
      const artistId = readI32(view, p + 20);
      ok = year >= 2000 && year <= 2100 && month >= 1 && month <= 12
        && day >= 1 && day <= 31 && kind <= 40 && thing <= 99 && artistId <= 200;
    }
    if (ok && (!best || count > best.count)) best = { offset, count };
  }
  return best;
}

/** 从存档自带的成绩/作品记录里建立作品编码 → 作品名，供历史得奖记录回查。 */
function scanSweetWorkNames(bytes: Uint8Array, view: DataView): Map<string, string> {
  const out = new Map<string, string>();
  const stride = 1022;
  for (let offset = 0; offset + stride <= bytes.length; offset += 1) {
    const code = readCode(bytes, offset + 68, 5);
    if (!code || bytes[offset + 73] !== 0) continue;
    const kind = readI32(view, offset + 64);
    const nameLength = readI32(view, offset + 74);
    const field = readI32(view, offset + 78);
    if (kind < 1 || kind > 31 || nameLength < 1 || nameLength > 64 || field < 1 || field > 64) continue;
    const years = [readI32(view, offset + 4), readI32(view, offset + 20)];
    if (!years.every((year) => year >= 2000 && year <= 2099)) continue;
    const name = readBig5(bytes, offset + 90, 32);
    if (name && !out.has(code)) out.set(code, name);
  }
  return out;
}

/** 团体名气/人气在存档里是千分位累计值，游戏界面显示 floor(raw / 1000)。 */
function sweetTeamDisplayValue(raw: number): number {
  return Math.max(0, Math.floor(raw / 1000));
}

/** 我方团体记录：与明星志愿3同构，但名字是紧排的 Big5，不像 .sa2 每字节占 4B。 */
function scanSweetTeams(bytes: Uint8Array, view: DataView, stars: Record<string, string>): SweetTeam[] {
  const marker = [73, 110, 118, 97, 105, 100]; // "Invaid"
  const out: SweetTeam[] = [];
  for (let o = 0; o + 128 <= bytes.length; o += 1) {
    const code = readI32(view, o);
    // 101..110 才是玩家可建的团体；111 起是游戏预设的 NPC 团体（馬麗安等），不能进我方卡。
    if (code < 101 || code > 110) continue;
    const nameBytes = readI32(view, o + 4);
    if (nameBytes < 4 || nameBytes > 24 || nameBytes % 2 !== 0) continue;
    const nameEnd = o + 8 + nameBytes + 1; // 名字后的 NUL
    if (bytes[nameEnd - 1] !== 0 || nameEnd + 56 > bytes.length) continue;
    const name = readBig5(bytes, o + 8, nameBytes);
    // 团名允许字母 / 数字（例如「SD樂團」），但不能有空白或标点，
    // 否则会在存档里乱扫到别的字符串。
    if (!/^[\u4e00-\u9fffA-Za-z0-9]+$/.test(name)) continue;
    const ids = [0, 1, 2].map((j) => readI32(view, nameEnd + 28 + j * 4));
    const hasMarker = readI32(view, nameEnd + 44) === marker.length
      && marker.every((c, j) => bytes[nameEnd + 48 + j] === c);
    const shapeOk = readI32(view, nameEnd + 24) <= 99
      && ids[0] >= 1 && ids[0] <= 110 && ids[1] >= 1 && ids[1] <= 110
      && (ids[2] === 0 || (ids[2] >= 1 && ids[2] <= 110))
      && readI32(view, nameEnd + 40) === 0;
    if (!hasMarker && !shapeOk) continue;
    const memberIds = [...new Set(ids.filter((id) => id >= 1 && id <= 110))];
    const nameOf = (id: number) => stars[String(id)] ?? `艺人${id}`;
    const rawWorkCount = readI32(view, nameEnd + 24);
    out.push({
      code,
      name,
      memberIds,
      memberNames: memberIds.map(nameOf),
      leaderId: memberIds[0] ?? 0,
      leaderName: memberIds.length ? nameOf(memberIds[0]) : '',
      workCount: rawWorkCount >= 0 && rawWorkCount <= 99 ? rawWorkCount : 0,
      works: [],
      fame: sweetTeamDisplayValue(readI32(view, nameEnd + 4)),
      popularity: sweetTeamDisplayValue(readI32(view, nameEnd + 8)),
    });
  }
  return out.sort((a, b) => a.code - b.code);
}

/** 团体唱片明细：记事表事项 13（唱片发行）且 `+24`（团体代表艺人编号）> 0。
 *  `+24` 与静态 CD roleType=4 双向核对零矛盾（+24>0 全是团体、=0 全是个人），
 *  自制唱片这类动态码也适用，不必依赖静态 Case 表。按 `+24` 落到所属团体；
 *  同团同码只保留一条（记事表会挤掉旧记录，但去重后顺序仍按发行日）。 */
function scanSweetGroupWorks(
  bytes: Uint8Array,
  view: DataView,
  teams: SweetTeam[],
  diaryTable: { offset: number; count: number } | null,
  noticeInfo: Map<string, SweetNoticeInfo>,
  tables: SweetCaseTables,
): Map<number, SweetWorkRecord[]> {
  const out = new Map<number, SweetWorkRecord[]>();
  if (!diaryTable) return out;
  const teamOfMember = new Map<number, SweetTeam>();
  for (const team of teams) {
    for (const id of team.memberIds) teamOfMember.set(id, team);
  }
  const seen = new Set<string>();
  for (let i = 0; i < diaryTable.count; i += 1) {
    const p = diaryTable.offset + 8 + i * SWEET_DIARY_STRIDE;
    if (readI32(view, p + 16) !== 13) continue;
    const workCode = readCode(bytes, p + 56, 5);
    if (!workCode || !workCode.startsWith('CD')) continue;
    const rep = readI32(view, p + 24);
    if (rep <= 0) continue;
    const team = teamOfMember.get(rep);
    if (!team) continue;
    const key = `${team.code}|${workCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const year = readI32(view, p);
    const month = readI32(view, p + 4);
    const day = readI32(view, p + 8);
    const info = noticeInfo.get(workCode);
    const list = out.get(team.code) ?? [];
    list.push({
      date: `${year}/${month}/${day}`,
      year, month, day,
      workCode,
      workName: info?.name || tables.cases?.[workCode] || workCode,
      company: info?.company || tables.companyByCode?.[workCode] || '',
      artistId: rep,
      noticeIndex: 2,
      role: '團體',
      order: i,
    });
    out.set(team.code, list);
  }
  // 记事表容量有限会挤掉最早的发行记录，所以明细条数可能少于团体记录里的
  // 累计唱片数。与个人作品同一口径：多的保留最近几条，缺的补「未留存」占位，
  // 绝不编作品名，保证 hover 条数始终等于卡片上的数字。
  for (const team of teams) {
    const list = out.get(team.code) ?? [];
    list.sort((a, b) =>
      a.year * 10000 + a.month * 100 + a.day - (b.year * 10000 + b.month * 100 + b.day)
      || a.workCode.localeCompare(b.workCode));
    const official = team.workCount;
    const kept = official >= 0 && list.length > official ? list.slice(list.length - official) : list;
    for (let k = kept.length; k < official; k += 1) {
      kept.push({
        date: '', year: 0, month: 0, day: 0,
        workCode: '', workName: '（存档未留存明细）', company: '',
        artistId: team.leaderId, noticeIndex: 2, role: '團體',
        order: 900000 + k,
      });
    }
    out.set(team.code, kept);
  }
  return out;
}

/** 艺人成绩里的举办活动：`[年][月][日][类型=6][事项=61..63][艺人编号]...`；
 *  +24 非零是团体场、+36 是规模（1 大型 / 2 中型 / 3 小型），团体名在 +76。 */
function scanDiaryEvents(
  bytes: Uint8Array,
  view: DataView,
  table: { offset: number; count: number } | null,
): SweetEvent[] {
  if (!table) return [];
  const rows: { event: SweetEvent; day: number }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * SWEET_DIARY_STRIDE;
    if (readI32(view, p + 12) !== SWEET_DIARY_EVENT_KIND) continue;
    const kind = readI32(view, p + 16);
    const name = SWEET_DIARY_EVENT_NAMES[kind];
    if (!name) continue;
    const scale = readI32(view, p + 36);
    if (scale < 1 || scale > 3) continue;
    const artistId = readI32(view, p + 20);
    if (artistId < 1 || artistId > 110) continue;
    const year = readI32(view, p);
    const month = readI32(view, p + 4);
    const day = readI32(view, p + 8);
    const group = readI32(view, p + 24) > 0;
    const groupName = group ? readBig5(bytes, p + 76, 16) : '';
    const key = `${year}/${month}/${day}|${kind}|${scale}|${group}|${artistId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      event: {
        year, month, day,
        date: `${year}/${month}/${day}`,
        label: `${SWEET_DIARY_EVENT_SCALE[scale]}${group ? '團體' : kind === 63 ? '個人' : ''}${name}`,
        kind, scale, group, groupName, artistId,
      },
      day: year * 10000 + month * 100 + day,
    });
  }
  return rows.sort((a, b) => a.day - b.day || a.event.artistId - b.event.artistId)
    .map((row) => row.event);
}

/**
 * 艺人成绩里的得奖记录：`[年][月][日][类型=5][事项=21..53][艺人编号]...[作品编码]`。
 * 这是与明星志愿3同构的真源，单份存档就能覆盖多年；事件簿尾部 48B 表只作兜底。
 */
function scanDiaryAwards(
  bytes: Uint8Array,
  view: DataView,
  protagonist: string,
  company: string,
  stars: Record<string, string>,
  table: { offset: number; count: number } | null,
): SweetAward[] {
  if (!table) return [];
  const workNames = scanSweetWorkNames(bytes, view);
  const rows: SweetAward[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * SWEET_DIARY_STRIDE;
    if (readI32(view, p + 12) !== SWEET_DIARY_AWARD_KIND) continue;
    const awardId = readI32(view, p + 16);
    const label = SWEET_DIARY_AWARD_NAMES[awardId];
    if (!label) continue;
    const artistId = readI32(view, p + 20);
    if (artistId < 1 || artistId > 110) continue;
    const year = readI32(view, p);
    const month = readI32(view, p + 4);
    const day = readI32(view, p + 8);
    const workCode = readCode(bytes, p + 56);
    const key = `${year}-${awardId}-${artistId}-${workCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const groupAward = SWEET_DIARY_GROUP_AWARD_IDS.has(awardId);
    const companyAward = SWEET_DIARY_COMPANY_AWARD_IDS.has(awardId);
    const embeddedGroup = groupAward ? readBig5(bytes, p + 76, 16) : '';
    rows.push({
      awardId,
      year,
      month,
      day,
      ceremony: SWEET_DIARY_CEREMONY[Math.floor(awardId / 10)] ?? '',
      label,
      winner: groupAward ? (embeddedGroup || stars[String(artistId)] || `团体${artistId}`)
        : companyAward ? company
          : artistId === 1 ? protagonist : stars[String(artistId)] ?? `艺人${artistId}`,
      work: workNames.get(workCode) ?? (workCode || '作品未记录'),
      workCode,
      artistId,
      group: groupAward,
      company: companyAward,
    });
  }
  return rows.sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day || a.label.localeCompare(b.label));
}

/** 记事表按作品编码建发行日期索引；同一部作品取最早一条，日期跟发行不跟获奖。 */
function buildSweetWorkDateIndex(
  bytes: Uint8Array, view: DataView, table: { offset: number; count: number } | null,
): {
  dates: Map<string, { date: string; year: number; month: number; day: number }>;
  seqs: Map<string, Map<string, number>>;
} {
  const dates = new Map<string, { date: string; year: number; month: number; day: number }>();
  const seqs = new Map<string, Map<string, number>>();
  if (!table) return { dates, seqs };
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * SWEET_DIARY_STRIDE;
    const code = readCode(bytes, p + 56);
    if (!code) continue;
    const year = readI32(view, p);
    const month = readI32(view, p + 4);
    const day = readI32(view, p + 8);
    const previous = dates.get(code);
    if (!previous || dayValue(year, month, day) < dayValue(previous.year, previous.month, previous.day)) {
      dates.set(code, { date: `${year}/${month}/${day}`, year, month, day });
    }
    const noticeIndex = SWEET_DIARY_WORK_TYPE[readI32(view, p + 16)];
    const seq = readI32(view, p + 36);
    const artistId = readI32(view, p + 20);
    if (noticeIndex === undefined || seq < 1 || seq > 999 || artistId < 1 || artistId > 110) continue;
    const groupKey = `${artistId}|${noticeIndex}`;
    const byCode = seqs.get(groupKey) ?? new Map<string, number>();
    if (!byCode.has(code)) byCode.set(code, seq);
    seqs.set(groupKey, byCode);
  }
  return { dates, seqs };
}

/** 记事表里的发行记录是「真正完成」的权威明细：每条带游戏官方「第 N 部」序号。
 *  参与清单只留最近若干条（早期作品会被挤掉），而预约但未拍摄的通告却会挂进去；
 *  所以明细必须以这里的发行记录为主，参与清单只用来补没有发行记录的早期作品。 */
function buildSweetDiaryWorks(
  bytes: Uint8Array,
  view: DataView,
  table: { offset: number; count: number } | null,
  noticeInfo: Map<string, SweetNoticeInfo>,
  tables: SweetCaseTables,
): SweetWorkRecord[] {
  if (!table) return [];
  const out: SweetWorkRecord[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * SWEET_DIARY_STRIDE;
    const workCode = readCode(bytes, p + 56);
    if (!workCode) continue;
    const noticeIndex = SWEET_DIARY_WORK_TYPE[readI32(view, p + 16)];
    if (noticeIndex === undefined) continue;
    const seq = readI32(view, p + 36);
    if (seq < 1 || seq > 999) continue;
    const artistId = readI32(view, p + 20);
    if (artistId < 1 || artistId > 110) continue;
    const key = `${artistId}|${noticeIndex}|${workCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const year = readI32(view, p);
    const month = readI32(view, p + 4);
    const day = readI32(view, p + 8);
    const info = noticeInfo.get(workCode);
    out.push({
      date: `${year}/${month}/${day}`, year, month, day,
      workCode,
      workName: info?.name || tables.cases?.[workCode] || workCode,
      company: info?.company || tables.companyByCode?.[workCode] || '',
      artistId, noticeIndex, role: '', order: 0, seq,
    });
  }
  return out;
}

/** 通告本体里的真实名字与制作公司槽位。游戏运行时生成的随机通告码
 *  （CFABY / TVANK 等）不会写进静态 Case dat，通告统计明细只能回查本体：
 *  `[5][5B ASCII 通告码][NUL]` 是锚点，锚点前 4 字节是 CaseFirm 的槽位 seq，
 *  本体 +22 是名字长度、+26 起是 Big5 名字。seq 经 sweetCompany 查公司名，
 *  广告/电视剧/唱片/电影/海外各槽位都与游戏界面一致。 */
interface SweetNoticeInfo {
  name: string;
  company: string;
  /** 本体倒数第二组档期的上档日再退一天，即游戏内发行日。与艺人成绩表交叉核对过：
   *  发行日＝倒数第二组上档日 - 1 天（Story0008 15/16、Ending0012 18/19 条命中），
   *  严格成绩表容量有限时用它兜底，保证早期作品也有日期。 */
  release?: { date: string; year: number; month: number; day: number };
}

function buildSweetNoticeInfoIndex(
  bytes: Uint8Array, view: DataView, tables: SweetCaseTables,
): Map<string, SweetNoticeInfo> {
  const out = new Map<string, SweetNoticeInfo>();
  const start = findSection(bytes, 'Case');
  const end = findSection(bytes, 'CaseEnd');
  if (start < 0 || end <= start) return out;
  for (let at = start + 8; at + 28 <= end; at += 1) {
    if (bytes[at] !== 5 || bytes[at + 1] || bytes[at + 2] || bytes[at + 3]) continue;
    let code = '';
    let ok = true;
    for (let k = 0; k < 5; k += 1) {
      const c = bytes[at + 4 + k];
      if (c < 0x30 || c > 0x7a) { ok = false; break; }
      code += String.fromCharCode(c);
    }
    if (!ok || !/^[A-Z]{2}[0-9A-Z]{3}$/.test(code) || out.has(code)) continue;
    const nameLength = readI32(view, at + 22);
    if (nameLength < 1 || nameLength > 64 || at + 26 + nameLength > end) continue;
    const name = readBig5(bytes, at + 26, nameLength);
    if (!name) continue;
    const seq = readI32(view, at - 4);
    const classId = readI32(view, at + 10);

    // 同一部作品的档期组数会随类别变化（广告/影视 5 组、唱片 4 组），
    // 但倒数第二组恒是上档日；游戏记事把发行记在上档前一天，逐字节验证过 CD/TVA/MVA/CFA。
    const dates: { offset: number; value: DateTuple }[] = [];
    const dateEnd = Math.min(end, at + 1024);
    for (let o = at + 860; o + 16 <= dateEnd && dates.length < 5; o += 1) {
      const tuple = readDateTuple(view, o);
      if (!tuple) continue;
      if (dates.length && o <= dates[dates.length - 1].offset + 4) continue;
      dates.push({ offset: o, value: tuple });
    }
    let release: SweetNoticeInfo['release'];
    const releaseTuple = dates.length >= 2 ? dates[dates.length - 2].value : null;
    if (releaseTuple) {
      const d = new Date(Date.UTC(releaseTuple[0], releaseTuple[1] - 1, releaseTuple[2] - 1));
      release = {
        date: `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
        year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      };
    }
    out.set(code, { name, company: sweetCompany(code, seq, classId, tables), release });
  }
  return out;
}

/** 每位艺人属性块后面挂着和 CaseCreate 同构的参与清单：
 *  `[条数][5]` + 每条 `[5B ASCII 通告码][NUL][大类 int32][5]`。
 *  这是「通告统计」明细的作品清单真源（早期作品也完整保留，从第一年就能拿到）；
 *  严格 108B 艺人成绩表只留最近几十条，另有一份 1022B 作品成绩表可回查作品名，
 *  逐条发行日期则以通告本体档期为准，详见 buildSweetNoticeInfoIndex。
 *  10/15/16/20/21/22/26/31 是同一作品的版本记录，只取大类 1..7；
 *  未杀青的自制通告还没完成，不能算进已接作品。 */
function parseSweetWorkHistory(
  bytes: Uint8Array,
  view: DataView,
  locations: SweetArtistLocation[],
  diaryTable: { offset: number; count: number } | null,
  tables: SweetCaseTables,
  selfMade: SweetSelfMadeNotice[],
  noticeInfo: Map<string, SweetNoticeInfo>,
  events: SweetEvent[],
): SweetWorkRecord[] {
  // 参与清单里连早期没有接演记录的自制作品也会累积进来，官方统计同样算它们；
  // 只有明确还在拍摄中的才没完成。旧作品本体没留档期时 status 是 unknown，
  // 过去排期已过但没人接的会显示未开拍，这两种都不能从明细里删。
  const unfinished = new Set(selfMade
    .filter((notice) => notice.status === 'shooting')
    .map((notice) => notice.code));
  const workIndex = buildSweetWorkDateIndex(bytes, view, diaryTable);
  // 记事表的发行记录才是「真正完成」的权威明细：带官方「第 N 部」序号，
  // 还能补回参与清单容量不足时被挤掉的早期作品。参与清单里没有发行记录的码
  // （预约了但没开拍／尚未发行）不算完成，不能进通告统计。
  const diaryWorks = buildSweetDiaryWorks(bytes, view, diaryTable, noticeInfo, tables);
  const diaryKeys = new Set(diaryWorks.map((w) => `${w.artistId}|${w.noticeIndex}|${w.workCode}`));
  const out: SweetWorkRecord[] = [...diaryWorks];
  for (let i = 0; i < locations.length; i += 1) {
    const location = locations[i];
    // 参与清单紧跟艺人属性块，可能被下一个艺人的块头打断；不能用下一个块的 offset
    // 截断窗口，否则像姚子奇那样最后几条（TVA0Y/TVACY）会被吃掉、被误补成占位。
    // 清单头尾都有 [count][5] / [code\0][大类][5] 严格校验，多扫一段不会误读。
    const stop = Math.min(location.offset + 2000, bytes.length);
    let head = -1;
    for (let h = location.offset + 372; h + 22 < stop; h += 1) {
      const count = readI32(view, h);
      if (count < 1 || count > 200 || readI32(view, h + 4) !== 5) continue;
      const code = readCode(bytes, h + 8, 5);
      if (!code || bytes[h + 13] !== 0) continue;
      const category = readI32(view, h + 14);
      if (category < 1 || category > 31 || readI32(view, h + 18) !== 5) continue;
      head = h;
      break;
    }
    if (head < 0) continue;
    const count = readI32(view, head);
    const seen = new Set<string>();
    for (let k = 0; k < count; k += 1) {
      const p = head + 8 + k * 14;
      if (p + 14 > stop) break;
      const workCode = readCode(bytes, p, 5);
      if (!workCode || bytes[p + 5] !== 0) break;
      const category = readI32(view, p + 6);
      if (category < 1 || category > 31 || !SWEET_WORK_RECORD_TAILS.has(readI32(view, p + 10))) break;
      const noticeIndex = SWEET_WORK_CLASS_INDEX[category];
      if (noticeIndex === undefined || unfinished.has(workCode)) continue;
      // 记事表已有发行记录的用那边的序号与日期，这里不重复添加；没有发行记录的
      // 才会落到这里，作为早期作品的兜底（未开拍的会在对齐时按序号被裁掉）。
      if (diaryKeys.has(`${location.id}|${noticeIndex}|${workCode}`)) continue;
      const key = `${noticeIndex}|${workCode}|${location.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // 发行日真源＝通告本体倒数第二组档期的上档日 - 1 天，已与艺人成绩表交叉核对；
      // 严格成绩表查不到时用本体发行日兜底，电视/电影这类老作品才不会整行没日期。
      const info = noticeInfo.get(workCode);
      const dated = workIndex.dates.get(workCode) ?? info?.release;
      out.push({
        date: dated?.date ?? '',
        year: dated?.year ?? 0,
        month: dated?.month ?? 0,
        day: dated?.day ?? 0,
        workCode,
        workName: info?.name || tables.cases?.[workCode] || workCode,
        company: info?.company || tables.companyByCode?.[workCode] || '',
        artistId: location.id,
        noticeIndex,
        role: '',
        order: k,
        seq: workIndex.seqs.get(`${location.id}|${noticeIndex}`)?.get(workCode),
      });
    }
    // 演唱会（事项 63）不在参与清单的 1..7 大类里，明细真源是艺人成绩的活动记录。
    // 只取个人场：团体演唱会挂团体卡、不进艺人通告统计；日期与「小型個人演唱會」
    // 这类名字直接沿用活动解析结果，避免单名单造作品名。
    const concerts = events.filter(
      (event) => event.kind === 63 && !event.group && event.artistId === location.id,
    );
    for (let k = 0; k < concerts.length; k += 1) {
      const event = concerts[k];
      out.push({
        date: event.date,
        year: event.year,
        month: event.month,
        day: event.day,
        workCode: '',
        workName: event.label,
        company: '',
        artistId: location.id,
        noticeIndex: 7,
        role: '',
        order: k,
      });
    }
  }
  return out;
}

/** 明细条数必须和游戏「通告统计」上的数字一致：多的裁掉，缺的补占位，不编作品名。
 *  排序按游戏官方「第 N 部」序号——序号是游戏认账的作品顺序，日期只是展示用；
 *  没有序号的早期作品排在后面，这样预约未拍摄的通告不会顶掉真正完成的作品。 */
function alignSweetWorks(locations: SweetArtistLocation[], works: SweetWorkRecord[]): SweetWorkRecord[] {
  const sortKey = (work: SweetWorkRecord) => {
    if (work.seq && work.seq >= 1) return work.seq;
    if (work.year > 0) return 100000 + work.year * 10000 + work.month * 100 + work.day;
    return 900000 + work.order;
  };
  const sorted = [...works].sort(
    (a, b) => sortKey(a) - sortKey(b) || a.workCode.localeCompare(b.workCode),
  );
  const aligned: SweetWorkRecord[] = [];
  for (const location of locations) {
    for (let noticeIndex = 0; noticeIndex < SWEET_NOTICE_LABELS.length; noticeIndex += 1) {
      const list = sorted.filter(
        (work) => work.artistId === location.id && work.noticeIndex === noticeIndex,
      );
      const official = location.noticeCounts[noticeIndex] ?? list.length;
      const kept = list.slice(0, official);
      aligned.push(...kept);
      const usedSeqs = new Set(kept.map((work) => work.seq).filter((seq): seq is number => !!seq && seq >= 1));
      let missing = 1;
      for (let k = kept.length; k < official; k += 1) {
        while (usedSeqs.has(missing)) missing += 1;
        const seq = missing++;
        aligned.push({
          date: '', year: 0, month: 0, day: 0,
          workCode: '', workName: '（存档未留存明细）', company: '',
          artistId: location.id, noticeIndex, role: '',
          order: 900000 + noticeIndex * 1000 + k,
          seq,
        });
      }
    }
  }
  // 展示顺序按「发生时间」正序，和主站同口径（UI 文案也是「按发生顺序」）：
  // 有日期的按年/月/日；无日期的占位用缺失序号放在开头（早期未留存明细），
  // 最后才退回参与清单原始顺序。裁剪仍按上面的 sortKey（seq 优先），
  // 避免没有序号的预约通告顶掉真正完成的作品。
  const displaySortKey = (work: SweetWorkRecord) => {
    if (work.year > 0) return work.year * 10000 + work.month * 100 + work.day;
    if (work.seq && work.seq >= 1) return -(1000000 - work.seq);
    return 900000 + work.order;
  };
  return aligned.sort(
    (a, b) => displaySortKey(a) - displaySortKey(b) || a.workCode.localeCompare(b.workCode),
  );
}

type DateTuple = [number, number, number, number];

/** 页面沿用主站的分类色，所以把游戏里的繁体大类归一成主站用词。 */
const SWEET_CATEGORY_SIMPLE: Record<string, string> = {
  廣告: '广告', 電視: '电视剧', 電影: '电影', 唱片: '唱片',
  主持: '主持', 舞台劇: '舞台剧', 時裝秀: '时装秀',
};
const SWEET_CATEGORY_BY_PREFIX: Record<string, string> = {
  CF: '广告', TV: '电视剧', MV: '电影', CD: '唱片',
  SH: '主持', TH: '舞台剧', FS: '时装秀',
};
/** CaseFirm 的海外刷新位次；这些槽的公司由通告大类决定，不是槽号本身。 */
const OVERSEAS_SEQS = new Set([21, 24, 25, 26, 27]);

/** 制作公司只认游戏表；查不到就留空，绝不按城市/类别猜名字。 */
function sweetCompany(
  code: string, seq: number, classId: number, tables: SweetCaseTables,
): string {
  const overseas = tables.overseasCompanies?.[String(classId)];
  if (overseas && (OVERSEAS_SEQS.has(seq) || classId === 6 || classId === 7)) {
    return overseas;
  }
  return tables.companyBySeq?.[String(seq)]
    ?? tables.companyByCode?.[code]
    ?? '';
}

/** 男性 / 女性角色才按性别过滤；个人、团体、主持类任何艺人都能接。 */
export function sweetRoleGender(roleType: number): 'male' | 'female' | undefined {
  if (roleType === 1 || roleType === 5 || roleType === 7) return 'male';
  if (roleType === 2 || roleType === 6 || roleType === 8) return 'female';
  return undefined;
}

/** StarRole.dat +4 的性别真值：0=女 / 1=男（姚子奇 1、雲芊 0）。
 *  主角编号 1 在表里就是 0（女），不再需要特判；统一走这里避免各 tab 口径漂移。 */
export function sweetArtistGender(artistId: number, tables: SweetCaseTables): 'male' | 'female' | undefined {
  const g = tables.genders?.[String(artistId)];
  return g === 0 ? 'female' : g === 1 ? 'male' : undefined;
}

/** 找 `[4]name\0` 段头，返回 payload 起点。 */
function findSection(bytes: Uint8Array, name: string): number {
  const marker = [name.length & 0xff, 0, 0, 0, ...Array.from(name).map((c) => c.charCodeAt(0)), 0];
  for (let i = 0; i + marker.length <= bytes.length; i += 1) {
    let ok = true;
    for (let k = 0; k < marker.length; k += 1) {
      if (bytes[i + k] !== marker[k]) { ok = false; break; }
    }
    if (ok) return i + marker.length;
  }
  return -1;
}

function readDateTuple(view: DataView, offset: number): DateTuple | null {
  const year = readI32(view, offset);
  const month = readI32(view, offset + 4);
  const day = readI32(view, offset + 8);
  const weekday = readI32(view, offset + 12);
  if (year < 2000 || year > 2099 || month < 1 || month > 12
    || day < 1 || day > 31 || weekday < 1 || weekday > 7) return null;
  return [year, month, day, weekday];
}

function dateText(value: [number, number, number] | DateTuple): string {
  return `${value[0]}/${value[1]}/${value[2]}`;
}

/** 日历差用 UTC 天数，不能用 `y*10000+m*100+d`：跨年会算出八千多天。 */
function dayValue(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function previousDay(tuple: DateTuple): [number, number, number] {
  const date = new Date(Date.UTC(tuple[0], tuple[1] - 1, tuple[2] - 1));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let ok = true;
    for (let k = 0; k < needle.length; k += 1) {
      if (haystack[i + k] !== needle[k]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

/** StarRole 里的「（新藝人）」「（無）」是空槽占位，不是真的有人预约。 */
function isRealReservationName(name: string): boolean {
  return Boolean(name) && !/新藝人|新艺人|（無）|\(無\)/.test(name);
}

/** 排期余量：剩下的日子里按每周上限折算最多还能排几天。 */
export function shootableDays(remaining: number, perWeek: number): number {
  if (!(remaining > 0) || !(perWeek > 0)) return 0;
  const weeks = Math.ceil(remaining / 7);
  return Math.min(remaining, weeks * perWeek);
}

/** 与主站同一套风险口径：排不下=违约、余量 ≤5 天=逾期风险。 */
export function sweetRiskOf(needDays: number, canShootDays: number, daysPerWeek: number): SweetShootingRisk {
  if (needDays <= 0) return 'ok';
  if (!(daysPerWeek > 0)) return 'unknown';
  const slack = canShootDays - needDays;
  if (slack < 0) return 'late';
  return slack <= 5 ? 'tight' : 'ok';
}

/** 一条通告本体的基本信息，筹备中与拍摄中共用。 */
interface SweetNoticeBody {
  code: string;
  name: string;
  category: string;
  type: string;
  company: string;
  roles: SweetNoticeRole[];
  dates: { offset: number; value: DateTuple }[];
  /** 第一个角色槽相对本体起点的偏移，宣传接演记录按它 +777 定位。 */
  roleAt: number;
  at: number;
}

/** 筹备中通告的预约真源＝本体尾部定长的 4 格 × 24B 槽区。
 *
 *  布局（每格 24B）：`+0` 状态、`+4` 艺人编号（0＝空缺）、`+8..+16` 保留、`+20` 酬劳。
 *  槽区起点 = 记录长度 − 204：后面固定还有 108B（5 组 16B 日期 + 28B 尾）。
 *  记录长度随作品名 / 角色名浮动（1016~1034B），所以只能按真实记录末尾锚定。
 *
 *  `StarRole` 段的 `[6][角色码\0][艺人编号][保留4B][状态4B]` 是历史表：状态 0
 *  才是在约，非 0 是解约／过期残留（Story0016 的 TVA921 状态 2、Story0005 的
 *  MVAMM4 状态 1）。全库 1190 条筹备中通告验证：状态非 0 的记录在槽区里都没有
 *  对应预约，所以预约一律只看本体槽，不再用 StarRole 兜底。 */
function readReservationIds(recView: DataView, limit: number): number[] {
  if (limit < 900 || limit > 1400) return [];
  const base = limit - 204;
  const ids: number[] = [];
  for (let k = 0; k < 4; k += 1) {
    const id = readI32(recView, base + k * 24 + 4);
    if (id < 0 || id > 110) return [];
    ids.push(id);
  }
  return ids;
}

/** Case 段里一条本体的真实结尾：下一条 `[5][5B 通告码][NUL]` 的起点。
 *  记录长度不是定值（1014~1034B，随名字长度浮动），而预约槽锚定在记录尾部，
 *  所以必须按真实长度切本体。找不到下一条时退回固定窗口。 */
function caseRecordEnd(caseBytes: Uint8Array, view: DataView, at: number): number {
  for (let o = at + 64; o + 32 <= caseBytes.length; o += 1) {
    if (caseBytes[o] !== 5 || caseBytes[o + 1] || caseBytes[o + 2] || caseBytes[o + 3]) continue;
    let ok = true;
    for (let k = 0; k < 5; k += 1) {
      const c = caseBytes[o + 4 + k];
      if (!((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a))) { ok = false; break; }
    }
    if (!ok || caseBytes[o + 9] !== 0) continue;
    const nameLength = readI32(view, o + 22);
    if (nameLength < 1 || nameLength > 64) continue;
    return o;
  }
  return Math.min(at + 1024, caseBytes.length);
}

/**
 * 角色工作天数 / 每周上限。真源是 Length.dat，key＝「通告种类|角色」：
 * - 电视剧：本体紧跟作品名之后的 1 字节是剧集长度编号（1 短片 / 2 單元劇 /
 *   3 連續劇，真源 TVLength.dat），用「電視N|角色」，查不到退回「電視|角色」
 *   （连续剧）。不能一刀切成 45 天——Auto 的夢想/愛上山上的楓是短片 10/5、
 *   幸福的抉擇是單元劇 20/12。
 * - 主持：+18 是 SHType.dat 节目型编号（1..5），用「主持N|角色」，每种节目型
 *   天数不同（知性談話 20/3、運動競賽 10/2 等，外景主持 20/3）。
 * - 其余大类：直接「大类|角色」（电影 / 广告 / 唱片 / 舞台劇 / 時裝秀）。
 */
function sweetLengthOf(
  tables: SweetCaseTables, classId: number, typeId: number,
  seriesId: number, roleName: string, rawCategory: string,
): [number, number] {
  const keys: string[] = [];
  if (classId === 2) {
    if (seriesId >= 1 && seriesId <= 3) keys.push(`電視${seriesId}|${roleName}`);
    keys.push(`電視|${roleName}`);
  } else if (classId === 5) {
    if (typeId >= 1 && typeId <= 5) keys.push(`主持${typeId}|${roleName}`);
  }
  keys.push(`${rawCategory}|${roleName}`);
  for (const key of keys) {
    const hit = tables.lengths?.[key];
    if (hit && hit[0]) return hit;
  }
  return [0, 0];
}

function readNoticeBody(
  rec: Uint8Array, recView: DataView, code: string,
  tables: SweetCaseTables, stars: Record<string, string>, classId: number,
  promo = false, dateLimit = 3, reservationRec: Uint8Array = rec,
): SweetNoticeBody | null {
  if (recView.byteLength < 64) return null;
  const nameLength = readI32(recView, 22);
  if (nameLength < 1 || nameLength > 64) return null;
  const name = readBig5(rec, 26, nameLength) || tables.cases?.[code] || code;
  const typeId = readI32(recView, 18);
  const rawCategory = tables.classes?.[String(classId)] ?? '';
  const category = SWEET_CATEGORY_SIMPLE[rawCategory]
    ?? SWEET_CATEGORY_BY_PREFIX[code.slice(0, 2)] ?? rawCategory ?? '';
  const type = tables.subtypes?.[`${classId}|${typeId}`] ?? '';

  const company = sweetCompany(code, 0, classId, tables);

  const roles: SweetNoticeRole[] = [];
  const seen = new Set<string>();
  let firstRoleAt = -1;
  for (let o = 0; o + 64 <= rec.length; o += 1) {
    if (rec[o] !== 1 || rec[o + 1] || rec[o + 2] || rec[o + 3]) continue;
    let end = o + 4;
    while (end < o + 11 && rec[end] >= 0x30 && rec[end] <= 0x7a) end += 1;
    const codeLength = end - (o + 4);
    if (codeLength < 5 || codeLength > 6 || rec[end] !== 0) continue;
    const roleCode = Array.from(rec.subarray(o + 4, end), (c) => String.fromCharCode(c)).join('');
    if (roleCode !== code && !(roleCode.startsWith(code) && roleCode.length === code.length + 1)) continue;
    if (seen.has(roleCode)) continue;
    const roleType = readI32(recView, o + 12);
    const star = readI32(recView, o + 16);
    // 宣传记录的角色槽星级恒为 0（个人/团体/主角只做分类），筹备中才是 1~5。
    if (roleType < 1 || roleType > 11 || star < (promo ? 0 : 1) || star > 5) continue;
    const values = Array.from({ length: 9 }, (_, i) => readI32(recView, o + 28 + i * 4));
    if (!values.every((value) => value >= 0 && value <= 999)) continue;
    seen.add(roleCode);
    if (firstRoleAt < 0) firstRoleAt = o;
    const roleName = tables.roles?.[String(roleType)] ?? '';
    // 剧集长度编号＝紧跟作品名之后的 1 字节（27+nameLength），只电视剧用；
    // 主持用 +18 节目型编号。具体查表见 sweetLengthOf。
    const seriesId = 27 + nameLength < recView.byteLength ? recView.getUint8(27 + nameLength) : 0;
    const [workDays, daysPerWeek] = sweetLengthOf(tables, classId, typeId, seriesId, roleName, rawCategory);
    roles.push({
      code: roleCode,
      role: roleName,
      roleType,
      star,
      requirements: values
        .map((value, i) => ({ attr: SWEET_ABILITY_LABELS[i], value }))
        .filter((item) => item.value > 0),
      workDays,
      daysPerWeek,
      reservedBy: '',
    });
  }
  const reservationView = new DataView(
    reservationRec.buffer, reservationRec.byteOffset, reservationRec.byteLength,
  );
  const reservationIds = readReservationIds(reservationView, reservationRec.byteLength);
  roles.forEach((role, i) => {
    const id = reservationIds[i] ?? 0;
    const reservedName = stars[String(id)] ?? '';
    if (id > 0 && id <= 110 && isRealReservationName(reservedName)) role.reservedBy = reservedName;
  });
  roles.sort((a, b) => a.code.localeCompare(b.code));

  const dates: { offset: number; value: DateTuple }[] = [];
  for (let o = 860; o + 16 <= rec.length && dates.length < dateLimit; o += 1) {
    const tuple = readDateTuple(recView, o);
    if (!tuple) continue;
    if (dates.length && o <= dates[dates.length - 1].offset + 4) continue;
    dates.push({ offset: o, value: tuple });
  }
  return { code, name, category, type, company, roles, dates, roleAt: firstRoleAt, at: 0 };
}

/** CaseFirm 列出的当期可接取通告，再用 Case 段本体补齐名字、角色、门槛和日期。 */
function scanSweetNotices(
  bytes: Uint8Array, view: DataView,
  today: SweetSave['date'], tables: SweetCaseTables, stars: Record<string, string>,
): SweetNotice[] {
  const firmStart = findSection(bytes, 'CaseFirm');
  const caseStart = findSection(bytes, 'Case');
  const caseEnd = findSection(bytes, 'CaseEnd');
  if (firmStart < 0 || caseStart < 0 || caseEnd <= caseStart) return [];
  const count = readI32(view, firmStart);
  if (count < 1 || count > 200) return [];
  const caseBytes = bytes.subarray(caseStart, caseEnd);
  const caseView = new DataView(caseBytes.buffer, caseBytes.byteOffset, caseBytes.byteLength);
  const out: SweetNotice[] = [];

  for (let index = 0; index < count; index += 1) {
    const p = firmStart + 4 + index * 18;
    if (p + 18 > bytes.length) break;
    const seq = readI32(view, p);
    const length = readI32(view, p + 8);
    let code = '';
    for (let k = 0; k < 5; k += 1) {
      const c = bytes[p + 12 + k];
      if (c < 0x30 || c > 0x7a) break;
      code += String.fromCharCode(c);
    }
    if (length !== 5 || !/^[A-Z]{2}[0-9A-Z]{3}$/.test(code)) continue;

    const needle = new Uint8Array(10);
    needle.set([5, 0, 0, 0]);
    for (let k = 0; k < 5; k += 1) needle[4 + k] = code.charCodeAt(k);
    const at = findBytes(caseBytes, needle);
    if (at < 0 || at + 256 > caseBytes.length) continue;
    const recEnd = caseRecordEnd(caseBytes, caseView, at);
    const rec = caseBytes.subarray(at, recEnd);
    const recView = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    const nameLength = readI32(recView, 22);
    if (nameLength < 1 || nameLength > 64) continue;
    const name = readBig5(rec, 26, nameLength) || tables.cases?.[code] || code;

    const classId = readI32(recView, 10);
    // +18 才是界面上显示的题材类型（如「轻松幽默剧」「爱情文艺片」）。
    // +14 不是 Length 表的剧集子类编号（TVA1K 的 +14=2 实际是 45 天连续剧），
    // 电视剧统一按「電視|角色」取长度，不再用 +14 拼 key。
    const typeId = readI32(recView, 18);
    const rawCategory = tables.classes?.[String(classId)] ?? '';
    const category = SWEET_CATEGORY_SIMPLE[rawCategory]
      ?? SWEET_CATEGORY_BY_PREFIX[code.slice(0, 2)] ?? rawCategory ?? '';
    const type = tables.subtypes?.[`${classId}|${typeId}`] ?? '';
    const company = sweetCompany(code, seq, classId, tables);

    const roles: SweetNoticeRole[] = [];
    const seen = new Set<string>();
    for (let o = 0; o + 64 <= rec.length; o += 1) {
      if (rec[o] !== 1 || rec[o + 1] || rec[o + 2] || rec[o + 3]) continue;
      let end = o + 4;
      while (end < o + 11 && rec[end] >= 0x30 && rec[end] <= 0x7a) end += 1;
      const codeLength = end - (o + 4);
      if (codeLength < 5 || codeLength > 6 || rec[end] !== 0) continue;
      const roleCode = Array.from(rec.subarray(o + 4, end), (c) => String.fromCharCode(c)).join('');
      if (roleCode !== code && !(roleCode.startsWith(code) && roleCode.length === code.length + 1)) continue;
      if (seen.has(roleCode)) continue;
      const roleType = readI32(recView, o + 12);
      const star = readI32(recView, o + 16);
      if (roleType < 1 || roleType > 11 || star < 1 || star > 5) continue;
      const values = Array.from({ length: 9 }, (_, i) => readI32(recView, o + 28 + i * 4));
      if (!values.every((value) => value >= 0 && value <= 999)) continue;
      seen.add(roleCode);
      const roleName = tables.roles?.[String(roleType)] ?? '';
      const seriesId = 27 + nameLength < recView.byteLength ? recView.getUint8(27 + nameLength) : 0;
      const [workDays, daysPerWeek] = sweetLengthOf(tables, classId, typeId, seriesId, roleName, rawCategory);
      roles.push({
        code: roleCode,
        role: roleName,
        roleType,
        star,
        requirements: values
          .map((value, i) => ({ attr: SWEET_ABILITY_LABELS[i], value }))
          .filter((item) => item.value > 0),
        workDays,
        daysPerWeek,
        reservedBy: '',
      });
    }
    // 预约真源＝本体尾部定长的 4 格 × 24B 槽区（见 readReservationIds）。
    const reservationIds = readReservationIds(recView, rec.length);
    roles.forEach((role, i) => {
      const id = reservationIds[i] ?? 0;
      const name = stars[String(id)] ?? '';
      if (id > 0 && id <= 110 && isRealReservationName(name)) role.reservedBy = name;
    });
    roles.sort((a, b) => a.code.localeCompare(b.code));

    const dates: { offset: number; value: DateTuple }[] = [];
    for (let o = 860; o + 16 <= rec.length && dates.length < 3; o += 1) {
      const tuple = readDateTuple(recView, o);
      if (!tuple) continue;
      if (dates.length && o <= dates[dates.length - 1].offset + 4) continue;
      dates.push({ offset: o, value: tuple });
    }
    const first = dates[0]?.value ?? [0, 0, 0, 0];
    const start = dates[1]?.value ?? first;
    const end = dates[2]?.value ?? start;
    const deadline = previousDay(start);
    const todayValue = dayValue(today.year, today.month, today.day);
    const startValue = dayValue(start[0], start[1], start[2]);
    const deadlineValue = dayValue(deadline[0], deadline[1], deadline[2]);
    let status: SweetNotice['status'] = 'open';
    // 与主站同口径：过了停止接取日（开拍前一天）就不能再接，不必等到杀青。
    if (start[0] && todayValue > deadlineValue) status = 'expired';
    else if (todayValue < dayValue(first[0], first[1], first[2])) status = 'upcoming';
    else if (todayValue <= deadlineValue && deadlineValue - todayValue <= 7) status = 'closing';

    out.push({
      seq,
      code,
      name,
      category,
      type,
      company,
      openDate: first[0] ? dateText(first) : '',
      deadline: start[0] ? dateText(deadline) : '',
      startDate: start[0] ? dateText(start) : '',
      endDate: end[0] ? dateText(end) : '',
      daysToDeadline: deadlineValue - todayValue,
      daysToStart: startValue - todayValue,
      status,
      roles,
    });
  }
  return out;
}

/** ScheduleClass.dat 的宣传子类；静态表没加载时仍按游戏编号回退，不按名字猜。 */
const SWEET_PROMO_KIND_FALLBACK: Record<number, string> = {
  10: '电视剧宣传', 15: '电影宣传', 16: '首映会', 20: '唱片宣传',
  21: '拍摄MTV', 22: '签名会', 26: '舞台剧演出', 31: '国际时装周',
};
const SWEET_PROMO_KIND_IDS = new Set(Object.keys(SWEET_PROMO_KIND_FALLBACK).map(Number));
const SWEET_PROMO_MAIN_KINDS = new Set([10, 15, 20, 26, 31]);

function sweetPromoSigner(
  artistId: number, teams: SweetTeam[], stars: Record<string, string>,
): string {
  const team = teams.find((item) => item.leaderId === artistId || item.memberIds.includes(artistId));
  return team?.name ?? stars[String(artistId)] ?? '';
}

/** 宣传中：作品本体 +10 的大类是 ScheduleClass 的宣传编号（10/15/16/20/21/22，
 *  甜蜜乐章另有 26 舞台剧演出 / 31 国际时装周）。接演槽从角色槽 +777 起，
 *  每 24B 一组 `[艺人编号][宣传天数]`，与拍摄中的 24B 接取记录不同。 */
function scanSweetPromo(
  bytes: Uint8Array, tables: SweetCaseTables,
  allStars: Record<string, string>, teams: SweetTeam[],
): SweetPromoNotice[] {
  const caseStart = findSection(bytes, 'Case');
  const caseEnd = findSection(bytes, 'CaseEnd');
  if (caseStart < 0 || caseEnd <= caseStart) return [];
  const caseBytes = bytes.subarray(caseStart, caseEnd);
  const caseView = new DataView(caseBytes.buffer, caseBytes.byteOffset, caseBytes.byteLength);
  const out: SweetPromoNotice[] = [];
  for (let i = 0; i + 10 <= caseBytes.length; i += 1) {
    if (caseBytes[i] !== 5 || caseBytes[i + 1] || caseBytes[i + 2] || caseBytes[i + 3]) continue;
    let code = '';
    let ok = true;
    for (let k = 0; k < 5; k += 1) {
      const c = caseBytes[i + 4 + k];
      if (c < 0x30 || c > 0x7a) { ok = false; break; }
      code += String.fromCharCode(c);
    }
    if (!ok || caseBytes[i + 9] || !/^[A-Z]{2}[0-9A-Z]{3}$/.test(code)) continue;
    const recEnd = caseRecordEnd(caseBytes, caseView, i);
    const rec = caseBytes.subarray(i, recEnd);
    const recView = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    if (recView.byteLength < 32) continue;
    const classId = readI32(recView, 10);
    if (!SWEET_PROMO_KIND_IDS.has(classId)) continue;
    const body = readNoticeBody(rec, recView, code, tables, allStars, classId, true);
    if (!body || body.roleAt < 0 || body.roles.length === 0 || body.dates.length < 2) continue;

    const casts: SweetPromoCast[] = [];
    const claimedRoles = new Set<string>();
    const sortedRoles = [...body.roles].sort((a, b) => a.code.localeCompare(b.code));
    for (let slot = 0; slot < 4; slot += 1) {
      const at = body.roleAt + 777 + slot * 24;
      if (at + 8 > recView.byteLength) break;
      const artistId = readI32(recView, at);
      const doneDays = readI32(recView, at + 4);
      if (artistId < 1 || artistId > 110 || doneDays < 0 || doneDays > 60) continue;
      // 角色先按接演槽位落位；性别明显冲突时回退到同性别未认领的角色。
      let role = sortedRoles[Math.min(slot, sortedRoles.length - 1)] ?? null;
      const want = sweetArtistGender(artistId, tables);
      if (role && want && sweetRoleGender(role.roleType) !== want && sortedRoles.length > 1) {
        role = sortedRoles.find((item) => !claimedRoles.has(item.code)
          && sweetRoleGender(item.roleType) === want) ?? role;
      }
      if (role) claimedRoles.add(role.code);
      // 「又怎么了」这类是团体名。只有团体角色才显示团名；主角编号 1 即便在团体里，
      // 个人宣传作品也一律显示存档自命名（reservationStars['1']）。
      const groupRole = role?.roleType === 4 || role?.role === '團體';
      const artistName = groupRole ? sweetPromoSigner(artistId, teams, allStars)
        : allStars[String(artistId)] ?? '';
      if (!isRealReservationName(artistName)) continue;
      casts.push({
        artistId,
        artistName,
        role: role?.role ?? '個人',
        doneDays,
      });
    }
    if (casts.length === 0) continue;

    const start = body.dates[0].value;
    const end = body.dates[1].value;
    out.push({
      code,
      name: body.name,
      category: body.category,
      kind: tables.promoKinds?.[String(classId)] ?? SWEET_PROMO_KIND_FALLBACK[classId],
      mainKind: SWEET_PROMO_MAIN_KINDS.has(classId),
      startDate: dateText(start),
      endDate: dateText(end),
      endDay: dayValue(end[0], end[1], end[2]),
      casts,
    });
  }
  return out;
}

/** 归档作品的接演网格：24B `[flag][id][成功][失败][完美][酬劳]`。
 *  网格起点随角色定义块长度浮动（Story0050 里 +812~+848 都出现过），
 *  写死 +816 会把日期年份当成艺人编号 / 酬劳。用「第一条有酬劳的真记录」
 *  定出 24B 网格，再向前后双向扩展；没有酬劳时才退回逐字节找最长合法链。
 *  pay=0 分两种：开拍日早于签约日＝未签约无数据（页面显示 —）；已过签约日＝明确 0 元（显示 0）。 */
function readSweetArchiveGrid(recView: DataView, starIds: Set<number>) {
  type Row = { artistId: number; success: number; fail: number; perfect: number; pay: number; slot: number };
  const from = 700;
  const to = Math.min(recView.byteLength - 24, 1010);
  const readAt = (p: number) => ({
    flag: readI32(recView, p),
    id: readI32(recView, p + 4),
    success: readI32(recView, p + 8),
    fail: readI32(recView, p + 12),
    perfect: readI32(recView, p + 16),
    pay: readI32(recView, p + 20),
  });
  const valid = (r: ReturnType<typeof readAt>, relaxed = false) =>
    r.flag >= 0 && r.flag <= (relaxed ? 8 : 3) && starIds.has(r.id)
    && r.success >= 0 && r.success <= 90 && r.fail >= 0 && r.fail <= 99
    && r.perfect >= 0 && r.perfect <= 99 && r.pay >= 0 && r.pay <= 1e9
    && (r.pay === 0 || (r.pay >= 1000 && r.pay % 1000 === 0));
  const chain = (anchor: number, relaxed = false): Row[] => {
    const rows: Row[] = [];
    const push = (p: number, front: boolean) => {
      const r = readAt(p);
      if (!valid(r, relaxed)) return false;
      // 除编号外全零的是空槽 / 文本错位，不是真接演；遇到就停，别造一条 0 天参演。
      if (r.success === 0 && r.fail === 0 && r.perfect === 0 && r.pay === 0) return false;
      const row: Row = {
        artistId: r.id, success: r.success, fail: r.fail,
        perfect: r.perfect, pay: r.pay, slot: 0,
      };
      if (!rows.some((item) => item.artistId === row.artistId)) {
        if (front) rows.unshift(row); else rows.push(row);
      }
      return true;
    };
    for (let p = anchor - 24; p >= from && p + 24 <= to; p -= 24) {
      if (!push(p, true)) break;
    }
    for (let p = anchor; p + 24 <= to; p += 24) {
      if (!push(p, false)) break;
    }
    rows.forEach((row, index) => { row.slot = index; });
    return rows;
  };

  // 先找有酬劳的真记录；pay 必定是千元整数倍，年份 / 文本不会被误收。
  for (let p = from; p + 24 <= to; p += 1) {
    const r = readAt(p);
    if (r.pay < 1000 || !valid(r)) continue;
    const rows = chain(p);
    // 有真实酬劳的锚点本身就是真记录，独角作品只有一格也要保留。
    if (rows.length >= 1) return rows;
  }
  // 整部作品都没付酬劳：放宽首字段到角色类型（5~8 的主角记录写在网格第一格），
  // 取最长的一条合法链；仍要求编号、天数、千元整数倍酬劳全部自洽。
  let best: Row[] = [];
  for (let p = from; p + 24 <= to; p += 1) {
    const r = readAt(p);
    if (!valid(r, true)) continue;
    const rows = chain(p, true);
    // 单条「编号 1 / 全 0」极可能是日期或文本错位读出来的噪声，不能凭它造一条参演。
    if (rows.length >= 2 && rows.length > best.length) best = rows;
  }
  return best;
}

/** 等待上市 / 热卖中共用：Case 本体的五组档期里，第四 / 第五组是上档 / 下档。
 *  等待上市＝今天已过杀青、还没到上档日；热卖中＝今天已到上档、还没下档；
 *  已完成＝今天已过下档日（与主站 archive 分档一致）。
 *  接演记录与拍摄中同构，但网格起点随本体浮动，用 readSweetArchiveGrid 定位；
 *  不能用作品清单或宣传档期代替发行档期。 */
function scanSweetArchive(
  bytes: Uint8Array, today: SweetSave['date'], tables: SweetCaseTables,
  allStars: Record<string, string>, teams: SweetTeam[], signedIds: number[],
  signDates: Map<number, number>, status: 'waiting' | 'hot' | 'done',
): SweetWaitingNotice[] {
  const caseStart = findSection(bytes, 'Case');
  const caseEnd = findSection(bytes, 'CaseEnd');
  if (caseStart < 0 || caseEnd <= caseStart) return [];
  const caseBytes = bytes.subarray(caseStart, caseEnd);
  const caseView = new DataView(caseBytes.buffer, caseBytes.byteOffset, caseBytes.byteLength);
  const mineIds = new Set([1, ...signedIds.filter((id) => id >= 1 && id <= 110)]);
  const starIds = new Set(Object.keys(allStars).map(Number).filter((id) => id >= 1 && id <= 110));
  const todayValue = dayValue(today.year, today.month, today.day);
  const starts: { at: number; code: string }[] = [];
  for (let i = 0; i + 10 <= caseBytes.length; i += 1) {
    if (caseBytes[i] !== 5 || caseBytes[i + 1] || caseBytes[i + 2] || caseBytes[i + 3]) continue;
    let code = '';
    let ok = true;
    for (let k = 0; k < 5; k += 1) {
      const c = caseBytes[i + 4 + k];
      if (c < 0x30 || c > 0x7a) { ok = false; break; }
      code += String.fromCharCode(c);
    }
    if (ok && caseBytes[i + 9] === 0 && /^[A-Z]{2}[0-9A-Z]{3}$/.test(code)) {
      starts.push({ at: i, code });
    }
  }

  const out: SweetWaitingNotice[] = [];
  const seen = new Set<string>();
  for (let idx = 0; idx < starts.length; idx += 1) {
    const { at, code } = starts[idx];
    if (seen.has(code)) continue;
    const nextAt = idx + 1 < starts.length ? starts[idx + 1].at : caseBytes.length;
    const length = Math.min(1024, nextAt - at);
    if (length < 1000) continue;
    const rec = caseBytes.subarray(at, at + length);
    const recView = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    const classId = readI32(recView, 10);
    // 宣传记录虽然也有五组日期，但它们是宣传档期，不是作品发行档期。
    if (SWEET_PROMO_KIND_IDS.has(classId)) continue;
    const body = readNoticeBody(rec, recView, code, tables, allStars, classId, false, 5);
    if (!body || body.dates.length < 5) continue;
    const end = body.dates[2].value;
    const saleStart = body.dates[3].value;
    const saleEnd = body.dates[4].value;
    const endDay = dayValue(end[0], end[1], end[2]);
    const saleDay = dayValue(saleStart[0], saleStart[1], saleStart[2]);
    const saleEndDay = dayValue(saleEnd[0], saleEnd[1], saleEnd[2]);
    const eligible = status === 'waiting'
      ? todayValue > endDay && todayValue < saleDay
      : status === 'hot'
        ? todayValue >= saleDay && todayValue <= saleEndDay
        : todayValue > saleEndDay;
    if (!eligible) continue;

    // 本体记录起点前 4 字节就是公司 seq（CaseFirm 同款编号）：筹备中从 CaseFirm
    // 拿，归档作品只能从本体拿。原先这里传 0，导致已完成整列公司都是空的。
    // seq 不止 1..30：烘焙表还有 31..34 / 41 / 51 / 61 / 71 / 81 / 91，写死上限会
    // 把 TVA1A（seq=32 純真年代）这类作品漏成空；直接查表，查不到仍留空。
    const seq = at >= 4 ? readI32(caseView, at - 4) : 0;
    const company = seq > 0
      ? sweetCompany(code, seq, classId, tables) : body.company;

    const casts: SweetWaitingCast[] = [];
    const seenArtists = new Set<number>();
    const claimedRoles = new Set<string>();
    const sortedRoles = [...body.roles].sort((a, b) => a.code.localeCompare(b.code));
    const grid = readSweetArchiveGrid(recView, starIds);
    const shootDate = body.dates[1].value;
    const shootDay = dayValue(shootDate[0], shootDate[1], shootDate[2]);
    for (const row of grid) {
      const { artistId, pay } = row;
      // 与拍摄中同口径：游戏界面的「完成天数」＝成功 + 完美，失败不计入完成。
      const doneDays = row.success + row.perfect;
      // 同一作品同一艺人只列一次：老本体里主角的槽位可能被重复写入。
      if (seenArtists.has(artistId)) continue;
      const team = teams.find((item) => item.leaderId === artistId || item.memberIds.includes(artistId));
      const isMine = mineIds.has(artistId)
        || Boolean(team && team.memberIds.some((id) => mineIds.has(id)));
      if (!isMine) continue;
      seenArtists.add(artistId);
      // 角色先按接演槽位落位；性别明显冲突时回退到同性别未认领的角色，
      // 否则 TV157 的女主角会被写成男配角。
      let role = row.slot < sortedRoles.length ? sortedRoles[row.slot] : null;
      const want = sweetArtistGender(artistId, tables);
      if (role && want && sweetRoleGender(role.roleType) !== want && sortedRoles.length > 1) {
        role = sortedRoles.find((item) => !claimedRoles.has(item.code)
          && sweetRoleGender(item.roleType) === want) ?? role;
      }
      if (role) claimedRoles.add(role.code);
      // 只有团体角色才显示团体名；主角即便在团体里，个人作品仍显示本人姓名。
      const groupRole = role?.roleType === 4 || role?.role === '團體';
      // 同为 pay=0：拍在签约日之前＝加入公司前无数据（显示 —）；已签约＝明确 0 元（显示 0）。
      const signDay = signDates.get(artistId);
      const payStatus: SweetWaitingCast['payStatus'] = pay === 0
        ? (signDay === undefined || signDay <= shootDay ? 'zero' : 'unsigned')
        : undefined;
      casts.push({
        artistId,
        artistName: groupRole && team ? team.name : allStars[String(artistId)] ?? `艺人${artistId}`,
        role,
        doneDays,
        pay,
        payStatus,
      });
    }
    if (casts.length === 0) continue;
    seen.add(code);
    out.push({
      code,
      name: body.name,
      category: body.category,
      type: body.type,
      company,
      startDate: dateText(body.dates[1].value),
      endDate: dateText(end),
      saleStart: dateText(saleStart),
      saleEnd: dateText(saleEnd),
      casts,
    });
  }
  return out;
}

/** 归档作品再按官方「通告统计」校验一次：参与清单里有记录、但官方同类计数为 0
 *  的作品（典型是艺人加入公司前拍的通告）不算我方作品。Ending0012 姚子奇参与清单
 *  有二十多条广告，官方广告却是 0，这些广告不该整列挂到他名下。
 *  官方计数是真源，不要再叠加「拍摄日 vs 签约日」这类推算——签约日字段可能是
 *  续约日，姚子奇 2009/12/27 之后签，但他的电视剧官方计数 11，仍是我方作品。 */
function filterSweetArchiveByOfficialCounts(
  notices: SweetWaitingNotice[], locations: SweetArtistLocation[],
): SweetWaitingNotice[] {
  const counts = new Map(locations.map((location) => [location.id, location.noticeCounts]));
  const categoryIndex: Record<string, number> = {
    '电视': 0, '电视剧': 0, '电影': 1, '唱片': 2, '广告': 3,
    '主持': 4, '舞台剧': 5, '时装秀': 6, '走秀': 6, '演唱会': 7,
  };
  return notices.filter((notice) => {
    const index = categoryIndex[notice.category];
    if (index === undefined) return true;
    return notice.casts.some((cast) => (counts.get(cast.artistId)?.[index] ?? 0) > 0);
  });
}

/** 自制作品及其他：CaseCreate 段只列通告码，名字 / 档期 / 接演记录仍在 Case 本体。
 *
 *  甜蜜乐章的 CaseCreate 与主站不同：段头是 `[条数][5]`，之后每条 14 字节
 *  `[5×ASCII 通告码][NUL][大类][档期长度编号]`，不是主站的 28 字节 int32 编码。
 *  本体与归档作品同构，接演网格也是 +816 起每 24B 一格，主角固定第 8 格。
 *  排期只有开拍 / 杀青两个日期，状态完全由今天落在哪一侧推出。 */
function scanSweetSelfMade(
  bytes: Uint8Array, today: SweetSave['date'], tables: SweetCaseTables,
  allStars: Record<string, string>, teams: SweetTeam[], signedIds: number[],
): SweetSelfMadeNotice[] {
  const createStart = findSection(bytes, 'CaseCreate');
  const caseStart = findSection(bytes, 'Case');
  const caseEnd = findSection(bytes, 'CaseEnd');
  if (createStart < 0 || caseStart < 0 || caseEnd <= caseStart) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = readI32(view, createStart);
  if (count < 1 || count > 400) return [];

  // Case 段里每条本体都以 `[5][5×ASCII 通告码][0]` 开头，用下一个起点限定块长。
  const starts: { at: number; code: string }[] = [];
  for (let i = caseStart; i + 10 <= caseEnd; i += 1) {
    if (bytes[i] !== 5 || bytes[i + 1] || bytes[i + 2] || bytes[i + 3]) continue;
    let code = '';
    let ok = true;
    for (let k = 0; k < 5; k += 1) {
      const c = bytes[i + 4 + k];
      if (c < 0x30 || c > 0x7a) { ok = false; break; }
      code += String.fromCharCode(c);
    }
    if (ok && bytes[i + 9] === 0 && /^[A-Z]{2}[0-9A-Z]{3}$/.test(code)) {
      starts.push({ at: i, code });
    }
  }

  const mineIds = new Set([1, ...signedIds.filter((id) => id >= 1 && id <= 110)]);
  const starIds = new Set(Object.keys(allStars).map(Number).filter((id) => id >= 1 && id <= 110));
  const todayValue = dayValue(today.year, today.month, today.day);
  const out: SweetSelfMadeNotice[] = [];

  for (let k = 0; k < count; k += 1) {
    const at = createStart + 8 + k * 14;
    if (at + 14 > bytes.length) break;
    let code = '';
    let valid = bytes[at + 5] === 0;
    for (let j = 0; j < 5 && valid; j += 1) {
      const c = bytes[at + j];
      if (c < 0x30 || c > 0x7a) { valid = false; break; }
      code += String.fromCharCode(c);
    }
    if (!valid || !/^[A-Z]{2}[0-9A-Z]{3}$/.test(code)) break;
    const days = readI32(view, at + 10);
    const first = starts.find((item) => item.code === code);
    if (!first) continue;
    const next = starts.find((item) => item.at > first.at);
    const length = Math.min(1024, (next?.at ?? caseEnd) - first.at);
    if (length < 1000) continue;
    const rec = bytes.subarray(first.at, first.at + length);
    const recView = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    const classId = readI32(recView, 10);
    const body = readNoticeBody(rec, recView, code, tables, allStars, classId, false, 4);
    if (!body) continue;

    const sortedRoles = [...body.roles].sort((a, b) => a.code.localeCompare(b.code));
    const casts: SweetSelfMadeCast[] = [];
    const claimed = new Set<string>();
    // 接演记录顺序＝角色号顺序，最多 8 格；主角在第 8 格，前四格之外也要读。
    for (let slot = 0; slot < 8; slot += 1) {
      const p = 816 + slot * 24;
      if (p + 24 > length) break;
      const flag = readI32(recView, p);
      const artistId = readI32(recView, p + 4);
      const doneDays = readI32(recView, p + 8);
      const a = readI32(recView, p + 12);
      const b = readI32(recView, p + 16);
      const pay = readI32(recView, p + 20);
      if (flag < 0 || flag > 3 || !starIds.has(artistId)) continue;
      // 尾部槽常写 `（無）` 占位编号，不是真的有人接演。
      if (!isRealReservationName(allStars[String(artistId)] ?? '')) continue;
      if (doneDays < 0 || doneDays > 90 || a < 0 || a > 99 || b < 0 || b > 99) continue;
      if (pay < 0 || pay > 1e9) continue;
      let role: SweetNoticeRole | null = sortedRoles[slot] ?? null;
      const want = sweetArtistGender(artistId, tables);
      if (role && want && sweetRoleGender(role.roleType) !== want && sortedRoles.length > 1) {
        role = sortedRoles.find((item) => !claimed.has(item.code)
          && sweetRoleGender(item.roleType) === want) ?? role;
      }
      if (!role && want && sortedRoles.length > 1) {
        role = sortedRoles.find((item) => !claimed.has(item.code)
          && sweetRoleGender(item.roleType) === want) ?? null;
      }
      if (role) claimed.add(role.code);
      else if (sortedRoles.length === 1) role = sortedRoles[0];
      // 与拍摄中同口径：完成 = 成功 + 完美（失败不计入完成），剩余 = 需完成 − 完成。
      const finishedDays = doneDays + b;
      const workDays = role?.workDays && role.workDays > 0
        ? Math.max(role.workDays, finishedDays) : finishedDays;
      const team = teams.find((item) => item.leaderId === artistId || item.memberIds.includes(artistId));
      const groupRole = role?.roleType === 4 || role?.role === '團體';
      casts.push({
        artistId,
        artistName: groupRole && team ? team.name : allStars[String(artistId)] ?? `艺人${artistId}`,
        role,
        pay,
        mine: mineIds.has(artistId)
          || Boolean(team && team.memberIds.some((id) => mineIds.has(id))),
        doneDays: finishedDays,
        needDays: Math.max(0, workDays - finishedDays),
        workDays,
        group: groupRole && team ? {
          name: team.name,
          leaderName: allStars[String(team.leaderId)] ?? `艺人${team.leaderId}`,
          memberNames: team.memberIds.map((id) => allStars[String(id)] ?? `艺人${id}`),
        } : null,
      });
    }

    const start = body.dates[0]?.value;
    const finish = body.dates[1]?.value;
    // 开拍必须是周一，否则宁可不显示档期也不猜；后期存档的块会挪几个字节。
    const startDate = start && start[3] === 1 && finish ? start : null;
    const startDay = startDate ? dayValue(startDate[0], startDate[1], startDate[2]) : NaN;
    const endDay = finish ? dayValue(finish[0], finish[1], finish[2]) : NaN;
    let status: SweetSelfMadeStatus = 'unknown';
    if (Number.isFinite(startDay) && Number.isFinite(endDay)) {
      status = todayValue < startDay ? 'pending' : todayValue <= endDay ? 'shooting' : 'done';
    }
    // 一个人都没接就谈不上拍摄，更谈不上完成：档期只是挂在列表上的排期。
    if (casts.length === 0) status = 'pending';
    else if (status === 'done') {
      // 档期一过作品就发布了，存档里的「已完成 / 还差」是杀青时的快照，
      // 不会因发布回写；不能拿它判逾期，一律按拍满处理。
      for (const cast of casts) {
        if (cast.workDays > 0) {
          cast.doneDays = cast.workDays;
          cast.needDays = 0;
        }
      }
    }
    out.push({
      seq: out.length + 1,
      code,
      name: body.name,
      category: body.category,
      type: body.type,
      company: body.company,
      days,
      daysPerWeek: sortedRoles.find((role) => role.daysPerWeek > 0)?.daysPerWeek ?? 0,
      roles: body.roles,
      casts,
      startDate: startDate ? dateText(startDate) : '',
      endDate: finish ? dateText(finish) : '',
      startDay,
      endDay,
      daysLeft: Number.isFinite(endDay) ? endDay - todayValue : NaN,
      daysToStart: Number.isFinite(startDay) ? startDay - todayValue : NaN,
      status,
    });
  }
  return out;
}

/** 拍摄中：已接取、还没杀青的通告。接取记录是 24B `[flag][id][done][a][b][pay]`，
 *  位于本体尾部 +800~+900，与主站同构。找第一条 pay≥1000 的真记录当锚点，
 *  再按 24B 网格前后双向扩展（带头像的艺人未必排最前），避免漏掉 pay=0 的演员。 */
function scanSweetShooting(
  bytes: Uint8Array, view: DataView,
  today: SweetSave['date'], tables: SweetCaseTables,
  allStars: Record<string, string>, signedIds: number[],
): SweetShootingNotice[] {
  const caseStart = findSection(bytes, 'Case');
  const caseEnd = findSection(bytes, 'CaseEnd');
  const firmStart = findSection(bytes, 'CaseFirm');
  if (caseStart < 0 || caseEnd <= caseStart) return [];
  const caseBytes = bytes.subarray(caseStart, caseEnd);

  // CaseFirm 里的是筹备中（可接取），即便有人预约也留在筹备中表里。
  const firmCodes = new Set<string>();
  if (firmStart >= 0) {
    const count = readI32(view, firmStart);
    if (count >= 1 && count <= 200) {
      for (let i = 0; i < count; i += 1) {
        const p = firmStart + 4 + i * 18;
        if (p + 18 > bytes.length) break;
        let code = '';
        for (let k = 0; k < 5; k += 1) {
          const c = bytes[p + 12 + k];
          if (c < 0x30 || c > 0x7a) break;
          code += String.fromCharCode(c);
        }
        if (code) firmCodes.add(code);
      }
    }
  }

  // 甜站主角固定占我方一位（编号 1），signedIds 里只有后三个签约艺人槽。
  const mineIds = new Set([1, ...signedIds.filter((id) => id >= 1 && id <= 110)]);
  const starIds = Object.keys(allStars).map(Number).filter((id) => id >= 1 && id <= 110);
  const todayValue = dayValue(today.year, today.month, today.day);
  const out: SweetShootingNotice[] = [];

  // 逐个定位 Case 段里的通告本体 `[5][5B code]\0`
  const starts: { at: number; code: string }[] = [];
  for (let i = 0; i + 10 <= caseBytes.length; i += 1) {
    if (caseBytes[i] !== 5 || caseBytes[i + 1] || caseBytes[i + 2] || caseBytes[i + 3]) continue;
    let code = '';
    let ok = true;
    for (let k = 0; k < 5; k += 1) {
      const c = caseBytes[i + 4 + k];
      if (c < 0x30 || c > 0x7a) { ok = false; break; }
      code += String.fromCharCode(c);
    }
    if (ok && caseBytes[i + 9] === 0 && /^[A-Z]{2}[0-9A-Z]{3}$/.test(code)) {
      starts.push({ at: i, code });
    }
  }

  for (let idx = 0; idx < starts.length; idx += 1) {
    const { at, code } = starts[idx];
    if (firmCodes.has(code)) continue;
    const nextAt = idx + 1 < starts.length ? starts[idx + 1].at : caseBytes.length;
    const length = Math.min(1024, nextAt - at);
    if (length < 256) continue;
    const rec = caseBytes.subarray(at, at + length);
    const recView = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
    const classId = readI32(recView, 10);
    // reservationRec 用未截断的本体：槽区锚在记录末尾，固定 1024B 窗口会错位。
    const body = readNoticeBody(rec, recView, code, tables, allStars, classId, false, 3, caseBytes.subarray(at, nextAt));
    // 日期组数不固定：已开拍的本体常见「开拍 / 杀青」两组（TV701），
    // 也有「开放接取 / 开拍 / 杀青」三组（TVANK）。统一取最后两组当开拍 / 杀青，
    // 否则只有两组时会被整条跳过（Story0008 的「學園的王子們」就是这样漏掉的）。
    if (!body || body.roles.length === 0 || body.dates.length < 2) continue;
    const start = body.dates[body.dates.length - 2].value;
    const end = body.dates[body.dates.length - 1].value;
    const startDay = dayValue(start[0], start[1], start[2]);
    const endDay = dayValue(end[0], end[1], end[2]);
    // 早就杀青的旧块接取记录也非零（作品清单是历史累积），不能进拍摄中。
    if (todayValue > endDay) continue;
    // 开拍日晚于杀青日是历史残留块（Story0050 的 CFA3O 6/14→6/13），
    // 不是当前在拍的通告；逐 4B 兜底还会把错位读到的主角算进去，直接排除。
    if (startDay > endDay) continue;
    const daysLeft = endDay - todayValue;

    const readAt = (p: number) => ({
      flag: readI32(recView, p),
      id: readI32(recView, p + 4),
      done: readI32(recView, p + 8),
      a: readI32(recView, p + 12),
      b: readI32(recView, p + 16),
      pay: readI32(recView, p + 20),
    });
    const valid = (r: ReturnType<typeof readAt>) =>
      r.flag >= 0 && r.flag <= 3 && starIds.includes(r.id)
      && r.done >= 0 && r.done <= 60 && r.a >= 0 && r.a <= 99
      && r.b >= 0 && r.b <= 99 && r.pay >= 0 && r.pay <= 1e9
      && !(r.pay > 0 && r.pay < 1000);
    const from = Math.min(700, Math.max(0, length - 260));
    const to = Math.min(length - 24, 960);
    let anchor = -1;
    // 接取网格的起点不是本体固定偏移：名字长度、角色槽数量都会让它整体平移，
    // Story0004 的 CFA1D 就落在 +847（非 4B 对齐），按 4 字节步进会整条漏掉。
    // 逐字节找锚点，但要求酬劳是千元整数且结构字段合法，避免把日期/字符串误当记录。
    for (let p = from; p + 24 <= to; p += 1) {
      const r = readAt(p);
      if (r.pay >= 1000 && r.pay <= 20_000_000 && r.pay % 1000 === 0 && valid(r)) {
        anchor = p;
        break;
      }
    }
    // done/a/b 分别是成功/失败/完美天数，三者相加才是已拍天数；
    // 还差天数＝通告总天数减掉这三项（Story0050 TVA1K 40+0+1，45 天里还差 4 天）。
    const progress: { artistId: number; done: number; a: number; b: number; pay: number }[] = [];
    if (anchor >= 0) {
      for (let p = anchor - 24; p >= from && p + 24 <= to; p -= 24) {
        const r = readAt(p);
        if (!valid(r)) break;
        if (!progress.some((row) => row.artistId === r.id)) {
          progress.unshift({ artistId: r.id, done: r.done, a: r.a, b: r.b, pay: r.pay });
        }
      }
      for (let p = anchor; p + 24 <= to; p += 24) {
        const r = readAt(p);
        if (!valid(r)) break;
        if (!progress.some((row) => row.artistId === r.id)) {
          progress.push({ artistId: r.id, done: r.done, a: r.a, b: r.b, pay: r.pay });
        }
      }
    } else {
      // 没有 pay 锚点时逐 4 字节兜底扫（接取网格起点随通告浮动，不固定 +816）。
      // 但逐 4 字节会把空槽的 done 字段错位读成艺人编号：新存档里
      // `[0][0][1][0][0][0]` 被错读成 flag=0/id=1/done=0/a=0/b=0/pay=0，
      // 造成「新开局没排通告却有一条主角拍摄中」。真接取即使还没开拍
      // （done=0 / pay=0），同组记录里 a 或 b 也有非零值（如 16/2、11）；
      // 除编号外全零的只可能是错位读出来的假记录，直接排除。
      for (let p = from; p + 24 <= to; p += 4) {
        const r = readAt(p);
        if (!valid(r)) continue;
        if (r.done === 0 && r.a === 0 && r.b === 0 && r.pay === 0) continue;
        if (!progress.some((row) => row.artistId === r.id)) {
          progress.push({ artistId: r.id, done: r.done, a: r.a, b: r.b, pay: r.pay });
        }
      }
    }
    if (progress.length === 0) continue;

    // 角色按接取记录顺序精确落位（主站核对过 1804 条零反例），性别明显冲突才回退。
    const sortedRoles = [...body.roles].sort((a, b) => a.code.localeCompare(b.code));
    const claimed = new Set<string>();
    const casts: SweetShootingCast[] = [];
    const otherCasts: SweetShootingOtherCast[] = [];
    for (let i = 0; i < progress.length; i += 1) {
      const row = progress[i];
      const name = allStars[String(row.artistId)] ?? `艺人${row.artistId}`;
      const isMine = mineIds.has(row.artistId);
      // 角色按接取记录顺序精确落位（主站 1804 条零反例），只在性别明显冲突时回退。
      let role: SweetNoticeRole | null = sortedRoles[i] ?? null;
      const need = role ? sweetRoleGender(role.roleType) : undefined;
      const want = sweetArtistGender(row.artistId, tables);
      if (role && need && want && need !== want && sortedRoles.length > 1) {
        role = sortedRoles.find((r) => !claimed.has(r.code)
          && sweetRoleGender(r.roleType) === want) ?? role;
      }
      if (role) claimed.add(role.code);
      else if (body.roles.length === 1) {
        role = body.roles[0];
        claimed.add(role.code);
      }
      if (!isMine) {
        otherCasts.push({ artistId: row.artistId, artistName: name, role, vacant: false });
        continue;
      }
      const workDays = role?.workDays ?? 0;
      const daysPerWeek = role?.daysPerWeek ?? 0;
      // 游戏界面口径：完成 = 成功 + 完美（失败不计入完成），剩余 = 需完成 − 完成。
      const doneDays = row.done + row.b;
      const done = workDays > 0 && doneDays >= workDays;
      const needDays = done ? 0 : workDays > 0 ? Math.max(0, workDays - doneDays) : 0;
      const canShoot = shootableDays(daysLeft, daysPerWeek);
      casts.push({
        artistId: row.artistId,
        artistName: name,
        role,
        workDays, daysPerWeek,
        doneDays,
        successDays: row.done,
        perfectDays: row.b,
        failDays: row.a,
        pay: row.pay,
        needDays, canShootDays: canShoot,
        risk: done ? 'ok' : sweetRiskOf(needDays, canShoot, daysPerWeek),
        status: done ? 'done' : todayValue < startDay ? 'pending' : 'shooting',
      });
    }
    if (casts.length === 0) continue;

    // 角色表里还没人认领的格＝虚位以待。
    for (const role of body.roles) {
      if (claimed.has(role.code)) continue;
      otherCasts.push({ artistId: null, artistName: '', role, vacant: true });
    }
    // 我方已拍够但通告整体还没到杀青日，游戏仍显示在拍（Story0050 的
    // TVA1K 主角 40 天拍完、档期到 8/8），不能因为「自家都交差」整条收起。
    const open = casts.filter((cast) => cast.status !== 'done');
    const risk: SweetShootingRisk = open.some((c) => c.risk === 'late') ? 'late'
      : open.some((c) => c.risk === 'tight') ? 'tight'
        : open.some((c) => c.risk === 'ok') ? 'ok' : 'unknown';

    out.push({
      code,
      name: body.name,
      category: body.category,
      type: body.type,
      company: body.company,
      startDate: dateText(start),
      endDate: dateText(end),
      startDay, endDay, daysLeft,
      roles: body.roles,
      casts, otherCasts, risk,
      offset: caseStart + at,
    });
  }
  return out;
}

/** 静态兜底；正常运行时从 case-tables.json 读 World.dat 烘焙结果。
 *  「世界脈動 → 國外情報」只展示这六座。 */
const SWEET_SCENE_TABLE: ReadonlyArray<{ name: string; rawName: string; cost: number }> = [
  { name: '东京', rawName: '東京', cost: 7000 },
  { name: '好莱坞', rawName: '好萊塢', cost: 11000 },
  { name: '巴黎', rawName: '巴黎', cost: 13000 },
  { name: '纽约', rawName: '紐約', cost: 15000 },
  { name: '伦敦', rawName: '倫敦', cost: 16000 },
  { name: '米兰', rawName: '米蘭', cost: 15000 },
];
const SWEET_SCENE_RECORD_STRIDE = 288;
/** 存档里场景记录仍是编号 2..11 的十座，界面只展示其中六座。 */
const SWEET_SCENE_RECORD_COUNT = 10;

/** 存档里十座场景的解锁记录与主站同构但更宽：每条 288B，
 *  `[编号 int32 小端 2..11][解锁标志 int32 0/1][场景码 int32][名字 16B Big5…]`，
 *  间隔与 World.dat 一致。标志就在名字前 8 字节（第二个 int32），不是更靠前的
 *  那个计数表。先把十条记录读成 rawName -> 标志，再按表筛选：界面只展示六座，
 *  若直接按表下标配编号会把 東京 错配到 長城 那条。靠编号 + 间隔 + 名字非空
 *  三重校验定位，不写死绝对偏移。 */
function scanSweetScenes(bytes: Uint8Array, view: DataView, tables: SweetCaseTables): SweetScene[] {
  const table = tables.scenes?.length ? tables.scenes : SWEET_SCENE_TABLE;
  for (let i = 0; i + 28 <= bytes.length; i += 1) {
    if (readI32(view, i) !== 2) continue;
    const flags = new Map<string, boolean>();
    let ok = true;
    for (let k = 0; k < SWEET_SCENE_RECORD_COUNT; k += 1) {
      const off = i + k * SWEET_SCENE_RECORD_STRIDE;
      if (off + 28 > bytes.length || readI32(view, off) !== k + 2) { ok = false; break; }
      const flag = readI32(view, off + 4);
      if (flag !== 0 && flag !== 1) { ok = false; break; }
      const name = readBig5(bytes, off + 12, 16);
      if (!name) { ok = false; break; }
      flags.set(name, flag === 1);
    }
    if (!ok || table.some((scene) => !flags.has(scene.rawName))) continue;
    return table.map((scene) => ({ ...scene, unlocked: flags.get(scene.rawName) ?? false }));
  }
  return [];
}

/** 制作人友好度：与艺人友好度同在一张 200B 步长表里，但不同段。每条
 *  `[友好度 int32 @0][…][编号 int32 @76]`。艺人段是 id 1..99，制作人段从
 *  id 302 起（编号不连续、有空槽），所以按编号反查、不数序号。定位靠
 *  「锚点编号 302 + 后续编号递增且落在 300..899、友好度 0..999」校验，
 *  不写死绝对偏移——存档长度随通告数变化。 */
function scanProducerFriendship(bytes: Uint8Array, view: DataView): Record<number, number> {
  const out: Record<number, number> = {};
  const stride = 200;
  const limit = bytes.length;
  for (let start = 270; start + stride <= limit; start += 1) {
    if (readI32(view, start + 76) !== 302) continue;
    if (readI32(view, start) < 0 || readI32(view, start) > 999) continue;
    let ok = true;
    for (let k = 0; k < 5; k += 1) {
      const off = start + k * stride;
      if (off + 80 > limit) { ok = false; break; }
      const code = readI32(view, off + 76);
      const fr = readI32(view, off);
      if (code < 300 || code > 899 || fr < 0 || fr > 999) { ok = false; break; }
    }
    if (!ok) continue;
    // 记录 200B：`+76` 是本条编号，但本条的好感度写在「下一条记录」的 `+0`
    // （Story0008 实测 301→309、302→304、306→227…全部对齐游戏界面）。
    // 锚点 302 之前还有 301，所以要先向前退到表头再统一扫，否则麦可永远读不到。
    let first = start;
    while (first - stride >= 0) {
      const off = first - stride;
      const code = readI32(view, off + 76);
      const fr = readI32(view, off);
      if (code < 300 || code > 899 || fr < 0 || fr > 999) break;
      first = off;
    }
    for (let off = first; off + stride <= limit; off += stride) {
      const code = readI32(view, off + 76);
      if (code < 300 || code > 899) break;
      const fr = readI32(view, off + stride);
      if (fr < 0 || fr > 999) break;
      out[code] = fr;
    }
    break;
  }
  return out;
}

/** 甜站 Item 段是真段头：`[4]["Item\0"][条数][16B × 条数]`，
 *  每条 `[编号][状态位][数量][附字段]`。状态位可能是 -12 / 96 这类标记，
 *  不能当类型或过滤条件；数量为 0 的行也保留，由页面决定不显示。 */
function scanSweetItems(bytes: Uint8Array, view: DataView, tables: SweetCaseTables): SweetOwnedItem[] {
  const start = findSection(bytes, 'Item');
  if (start < 0) return [];
  const count = readI32(view, start);
  if (count < 0 || count > 100000 || start + 4 + count * 16 > bytes.length) return [];
  const out: SweetOwnedItem[] = [];
  for (let k = 0; k < count; k += 1) {
    const o = start + 4 + k * 16;
    const code = readI32(view, o);
    const flag = readI32(view, o + 4);
    const quantity = readI32(view, o + 8);
    const meta = readI32(view, o + 12);
    if (code <= 0 || code >= 100000 || quantity < 0 || quantity >= 100000
      || meta < 0 || meta >= 1000) continue;
    const info = tables.items?.[String(code)];
    out.push({
      code,
      flag,
      quantity,
      meta,
      name: info?.[0] || `道具${code}`,
      category: info?.[1],
      desc: info?.[2],
      stats: info?.[3],
    });
  }
  return out;
}

/** 甜站 Clothes 段是真段头：`[7]["Clothes\0"][条数][8B × 条数]`，
 *  每条 `[编号][拥有标志]`；名字 / 说明由 Cloth.dat 烘焙表回查。 */
function scanSweetClothes(bytes: Uint8Array, view: DataView, tables: SweetCaseTables): SweetOwnedItem[] {
  const start = findSection(bytes, 'Clothes');
  if (start < 0) return [];
  const count = readI32(view, start);
  if (count < 0 || count > 200 || start + 4 + count * 8 > bytes.length) return [];
  const out: SweetOwnedItem[] = [];
  for (let k = 0; k < count; k += 1) {
    const o = start + 4 + k * 8;
    const code = readI32(view, o);
    const quantity = readI32(view, o + 4);
    const info = tables.clothes?.[String(code)];
    if (!info?.[0]) continue;
    out.push({
      code,
      flag: 0,
      quantity,
      meta: 0,
      name: info[0],
      category: '衣服',
      desc: info[1],
    });
  }
  return out;
}

export function formatSweetDate(date: SweetSave['date']): string {
  const w = WEEKDAYS[date.weekday - 1] ?? String(date.weekday);
  return `${date.year}年${date.month}月${date.day}日 星期${w}`;
}

/** 结局档把签约槽 / 日期提到头部，普通头部整体后移 84B；这里统一给出实际偏移。 */
function sweetHeaderLayout(view: DataView): {
  protagonist: number;
  company: number;
  money: number;
  signed: number[];
  date: number[];
} {
  const endingSigned = [0x08, 0x0c, 0x10].map((o) => readI32(view, o));
  const endingDate = [0x14, 0x18, 0x1c, 0x20].map((o) => readI32(view, o));
  const isEnding = readI32(view, 0x04) === 1
    && endingSigned.every((id) => id === -1 || (id >= 1 && id <= 110))
    && endingDate[0] >= 2000 && endingDate[0] <= 9999
    && endingDate[1] >= 1 && endingDate[1] <= 12
    && endingDate[2] >= 1 && endingDate[2] <= 31
    && endingDate[3] >= 1 && endingDate[3] <= 7;
  return isEnding
    ? {
        protagonist: 0x58,
        company: 0x6d,
        // 结局档头部重排：@0x30 是固定值（722921 / 460770…），不是资金；
        // 全量 13 份 Ending 档里 @0x3c 都是各不相同的千万级金额，才是资金。
        money: 0x3c,
        signed: [0x08, 0x0c, 0x10],
        date: [0x14, 0x18, 0x1c, 0x20],
      }
    : {
        protagonist: 0x04,
        company: 0x19,
        // 与主站同在 @80(0x50)：Story0050 真值 134057974 精确命中；
        // @0x58 是固定字段（722921 / 722922），抄主站偏移时常误写成它。
        money: 0x50,
        signed: [0x34, 0x38, 0x3c],
        date: [0x40, 0x44, 0x48, 0x4c],
      };
}

export async function parseSweetSave(
  file: File,
  stars: Record<string, string>,
  titles: Record<string, string> = {},
  tables: SweetCaseTables = {},
): Promise<SweetSave> {
  const bytes = await inflateSave(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 0x50) throw new Error('存档数据过短，不是有效的甜蜜乐章存档');

  const header = sweetHeaderLayout(view);
  const signedIds = header.signed.map((o) => readI32(view, o)).filter((id) => id >= 1 && id <= 110);
  const protagonist = readBig5(bytes, header.protagonist);
  // UI 里的主角名一律用存档内自命名，预约列也跟随，避免数值对比与预约两处不同名。
  const displayProtagonist = protagonist || stars['1'] || '杜云芊';
  const reservationStars = { ...stars, '1': displayProtagonist };
  const company = readCompany(bytes, view);
  const blocks = scanArtists(bytes, view, titles);
  const locations = scanArtistLocations(bytes, view);
  const relations = scanRelations(view, bytes);
  const withRelation = (id: number, values: ArtistValues) => ({
    ...values,
    friendship: relations.get(id)?.friendship ?? 0,
    gifts: relations.get(id)?.gifts ?? 0,
  });
  const artists: SweetArtistCard[] = [
    {
      id: 1,
      name: displayProtagonist,
      isProtagonist: true,
      ...withRelation(1, scanProtagonist(bytes, view, titles)),
    },
    ...signedIds.map((id): SweetArtistCard => ({
      id,
      name: stars[String(id)] ?? `艺人${id}`,
      isProtagonist: false,
      ...withRelation(id, blocks.get(id) ?? EMPTY_VALUES),
    })),
  ];

  // 归档酬劳为 0 时靠「拍摄日是否早于签约日」区分无数据 / 明确 0 元。
  const signDates = new Map<number, number>();
  for (const artist of artists) {
    const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(artist.contract?.signDate ?? '');
    if (match) signDates.set(artist.id, dayValue(Number(match[1]), Number(match[2]), Number(match[3])));
  }
  const date = {
    year: readI32(view, header.date[0]),
    month: readI32(view, header.date[1]),
    day: readI32(view, header.date[2]),
    weekday: readI32(view, header.date[3]),
  };
  const companyName = readBig5(bytes, header.company);
  const teams = scanSweetTeams(bytes, view, stars);
  const diaryTable = findSweetDiaryTable(view, bytes.length);
  const diaryAwards = scanDiaryAwards(bytes, view, protagonist, companyName, stars, diaryTable);
  const notices = scanSweetNotices(bytes, view, date, tables, reservationStars);
  const shooting = scanSweetShooting(bytes, view, date, tables, reservationStars, signedIds);
  const promo = scanSweetPromo(bytes, tables, reservationStars, teams);
  const waiting = filterSweetArchiveByOfficialCounts(
    scanSweetArchive(bytes, date, tables, reservationStars, teams, signedIds, signDates, 'waiting'), locations,
  );
  const hot = filterSweetArchiveByOfficialCounts(
    scanSweetArchive(bytes, date, tables, reservationStars, teams, signedIds, signDates, 'hot'), locations,
  );
  const done = filterSweetArchiveByOfficialCounts(
    scanSweetArchive(bytes, date, tables, reservationStars, teams, signedIds, signDates, 'done'), locations,
  );
  const selfMade = scanSweetSelfMade(bytes, date, tables, reservationStars, teams, signedIds);
  const noticeInfo = buildSweetNoticeInfoIndex(bytes, view, tables);
  const groupWorks = scanSweetGroupWorks(bytes, view, teams, diaryTable, noticeInfo, tables);
  for (const team of teams) team.works = groupWorks.get(team.code) ?? [];
  const events = scanDiaryEvents(bytes, view, diaryTable);
  const works = alignSweetWorks(
    locations,
    parseSweetWorkHistory(bytes, view, locations, diaryTable, tables, selfMade, noticeInfo, events),
  );
  const items = scanSweetItems(bytes, view, tables);
  const clothes = scanSweetClothes(bytes, view, tables);
  const scenes = scanSweetScenes(bytes, view, tables);
  const producerFriendship = scanProducerFriendship(bytes, view);
  return {
    protagonist: readBig5(bytes, header.protagonist),
    company: companyName,
    companyImage: company.image,
    fame: company.fame,
    pr: company.pr,
    money: readI32(view, header.money),
    date,
    signedIds,
    artists,
    teams,
    awards: diaryAwards.length > 0 ? diaryAwards : scanAwards(bytes, date.year),
    events,
    works,
    notices,
    shooting,
    promo,
    waiting,
    hot,
    done,
    selfMade,
    items,
    clothes,
    scenes,
    producerFriendship,
    producers: tables.producers ?? [],
  };
}
