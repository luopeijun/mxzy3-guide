import type { SweetAward } from './sweetCaseParser';

/**
 * 同一轮游玩中前两年的得奖记录。
 *
 * Auto.sav 只保存「当前一年」的 15 条得奖表；游戏内排行榜的 2008 / 2009
 * 年份页靠该轮游玩的历史记录还原。这里的两组数据从同一轮游玩的
 * `Story0009.sav`（2008）与 `Story0007.sav`（2009）冻结快照提取，
 * 文件见 `tests/fixtures/saves/sweet/`。
 */
export const SWEET_AWARD_HISTORY: SweetAward[] = [
  { year: 2008, ceremony: '金曲奖', label: '最佳新人', winner: '佩君', work: '我們和你們', company: false },
  { year: 2008, ceremony: '金曲奖', label: '最佳演唱人', winner: '佩君', work: '我們和你們', company: false },
  { year: 2008, ceremony: '金曲奖', label: '最佳团体', winner: '腐女之愛', work: '黑色娃娃', company: true },
  { year: 2008, ceremony: '金曲奖', label: '年度专辑', winner: '君君堡', work: '我們和你們', company: true },
  { year: 2008, ceremony: '金像奖', label: '最佳男主角', winner: '馬智文', work: '深夜潛入', company: false },
  { year: 2008, ceremony: '金像奖', label: '最佳女主角', winner: '方若綺', work: '愛你不是兩三天', company: false },
  { year: 2008, ceremony: '金像奖', label: '最佳男配角', winner: '童靖陽', work: '妙手飄香之胭脂淚', company: false },
  { year: 2008, ceremony: '金像奖', label: '最佳女配角', winner: '古芊菁', work: '夢中人', company: false },
  { year: 2008, ceremony: '金钟奖', label: '最佳男演员', winner: '黎華', work: '雙職情人', company: false },
  { year: 2008, ceremony: '金钟奖', label: '最佳女演员', winner: '佩君', work: '名字', company: false },
  { year: 2008, ceremony: '金钟奖', label: '最佳主持人', winner: '彭胡', work: '明星，你玩轉~', company: false },
  { year: 2008, ceremony: '金钟奖', label: '年度戏剧', winner: '君君堡', work: '名字', company: true },
  { year: 2008, ceremony: '金星奖', label: '最上镜头', winner: '姚子奇', work: '薇楓洗髮乳童話篇', company: false },
  { year: 2008, ceremony: '金星奖', label: '最佳模特儿', winner: '方若綺', work: '恩蜜 出嫁篇', company: false },
  { year: 2008, ceremony: '金星奖', label: '最佳代言人', winner: '方若綺', work: '戀愛金飾 大海篇', company: false },
  { year: 2009, ceremony: '金曲奖', label: '最佳新人', winner: '原少緯', work: '分手的心情', company: false },
  { year: 2009, ceremony: '金曲奖', label: '最佳演唱人', winner: '佩君', work: '逃離過去', company: false },
  { year: 2009, ceremony: '金曲奖', label: '最佳团体', winner: 'SD樂團', work: 'OUR MINDS', company: true },
  { year: 2009, ceremony: '金曲奖', label: '年度专辑', winner: '君君堡', work: '逃離過去', company: true },
  { year: 2009, ceremony: '金像奖', label: '最佳男主角', winner: '丹尼斯', work: '愛人與被愛', company: false },
  { year: 2009, ceremony: '金像奖', label: '最佳女主角', winner: '方若綺', work: '奧里的童話故事', company: false },
  { year: 2009, ceremony: '金像奖', label: '最佳男配角', winner: '彭胡', work: '花開的季節', company: false },
  { year: 2009, ceremony: '金像奖', label: '最佳女配角', winner: '新名紗雪', work: '青鳥傳說', company: false },
  { year: 2009, ceremony: '金钟奖', label: '最佳男演员', winner: '黎華', work: '雙職情人', company: false },
  { year: 2009, ceremony: '金钟奖', label: '最佳女演员', winner: '佩君', work: '名字', company: false },
  { year: 2009, ceremony: '金钟奖', label: '最佳主持人', winner: '彭胡', work: '明星，你玩轉~', company: false },
  { year: 2009, ceremony: '金钟奖', label: '年度戏剧', winner: '君君堡', work: '名字', company: true },
  { year: 2009, ceremony: '金星奖', label: '最上镜头', winner: '姚子奇', work: '薇楓洗髮乳童話篇', company: false },
  { year: 2009, ceremony: '金星奖', label: '最佳模特儿', winner: '方若綺', work: '恩蜜 出嫁篇', company: false },
  { year: 2009, ceremony: '金星奖', label: '最佳代言人', winner: '方若綺', work: '戀愛金飾 大海篇', company: false },
];

/** Auto.sav 当前年度得奖表的指纹：只有这一轮游玩才附带上面的历史记录。 */
export const SWEET_AUTO_AWARD_SIGNATURE: ReadonlyArray<readonly [string, string]> = [
  ['陳奕夫', '讓我盡情哭泣'],
  ['佩君', '風箏斷了線'],
  ['君君堡', '晴天娃娃'],
  ['佩君', '散熱冰棒 情侶篇'],
];
