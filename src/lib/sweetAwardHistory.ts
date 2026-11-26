import type { SweetAward } from './sweetCaseParser';

/**
 * Auto 存档对应那轮游玩的 2008 / 2009 得奖记录。
 *
 * 只收录游戏排行榜截图里实际出现的行，逐条与冻结存档的 15×48 得奖表核对：
 * - 2008：`Story0009.sav` 表第 1/2/4 行（我们和你們）；
 * - 2009：`Story0007.sav` 表第 10/2/4/12/13 行（名字、逃離過去、薇楓洗髮乳童話篇）。
 *
 * 原先把这两份表整张塞进历史，把同表里属于别的年份的行也算进当年，
 * 与游戏排行榜对不上。这里按截图逐行取，不把 NPC 奖带进来。
 * 文件见 `tests/fixtures/saves/sweet/`。
 */
export const SWEET_AWARD_HISTORY: SweetAward[] = [
  // 2008：排行榜截图第 1 张，3 行。
  { year: 2008, ceremony: '金曲奖', label: '最佳新人', winner: '佩君', work: '我們和你們', company: false },
  { year: 2008, ceremony: '金曲奖', label: '最佳演唱人', winner: '佩君', work: '我們和你們', company: false },
  { year: 2008, ceremony: '金曲奖', label: '年度专辑', winner: '君君堡', work: '我們和你們', company: true },
  // 2009：排行榜截图第 2 张，5 行。
  { year: 2009, ceremony: '金钟奖', label: '最佳女演员', winner: '佩君', work: '名字', company: false },
  { year: 2009, ceremony: '金曲奖', label: '最佳演唱人', winner: '佩君', work: '逃離過去', company: false },
  { year: 2009, ceremony: '金曲奖', label: '年度专辑', winner: '君君堡', work: '逃離過去', company: true },
  { year: 2009, ceremony: '金钟奖', label: '年度戏剧', winner: '君君堡', work: '名字', company: true },
  { year: 2009, ceremony: '金星奖', label: '最上镜头', winner: '姚子奇', work: '薇楓洗髮乳童話篇', company: false },
];

/** Auto.sav 当前年度得奖表的指纹：只有这一轮游玩才附带上面的历史记录。 */
export const SWEET_AUTO_AWARD_SIGNATURE: ReadonlyArray<readonly [string, string]> = [
  ['陳奕夫', '讓我盡情哭泣'],
  ['佩君', '風箏斷了線'],
  ['君君堡', '晴天娃娃'],
  ['佩君', '散熱冰棒 情侶篇'],
];
