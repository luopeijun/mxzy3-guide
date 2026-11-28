/* Regression for src/lib/sweetCaseParser.ts.
 *
 * 冻结的甜蜜乐章 .sav 快照 + 玩家逐项核对过的真值，覆盖近期修复的关键口径：
 *   1) 预约真源＝Case 本体尾部定长槽（StarRole 只是历史表，不能当预约）；
 *   2) 通告明细角色＝本体接演配对优先，早期作品回退作品成绩表的角色定义 +
 *      性别 / 星级，不猜无配对的作品；
 *   3) 工作天数按剧集类型 / 主持节目型查表，不拿固定 45 天套所有电视剧；
 *   4) 通告统计只算已发行作品、按发生日期排序、角色胶囊来自 cast；
 *   5) 停止接取 / 团体名 / 场景解锁 / 道具上限等单局真值不漂移。
 *
 * 只读 tests/fixtures/saves/sweet/ 的冻结快照，不读游戏活档（会被游玩改写）。
 * Usage: node scripts/test_sweet_case_parser.mjs
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, '.tmp');
fs.mkdirSync(tmp, { recursive: true });
const bundle = path.join(tmp, 'sweet-case-parser.test.cjs');
await build({
  entryPoints: [path.join(root, 'src/lib/sweetCaseParser.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});
const { parseSweetSave, sweetRoleGender, shootableDays, sweetRiskOf } = await import(
  pathToFileURL(bundle).href + `?v=${Date.now()}`
).then((m) => m.default ?? m);

const TABLES = JSON.parse(fs.readFileSync(path.join(root, 'public/data/sweet/case-tables.json'), 'utf8'));
const STAR_ROLES = JSON.parse(fs.readFileSync(path.join(root, 'public/data/sweet/star-roles.json'), 'utf8'));
const SAVES = path.join(root, 'tests/fixtures/saves/sweet');
const tables = { ...TABLES, genders: STAR_ROLES.genders };

let failures = 0;
let checks = 0;
const check = (ok, label, extra = '') => {
  checks += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
  if (!ok) failures += 1;
};

const cache = new Map();
async function load(name) {
  if (!cache.has(name)) {
    const file = path.join(SAVES, name);
    const buf = fs.readFileSync(file);
    cache.set(name, parseSweetSave(new File([buf], name), STAR_ROLES.stars, {}, tables));
  }
  return cache.get(name);
}
const byCode = (save, code) => save.notices.find((n) => n.code === code);
const workOf = (save, code, artistId) =>
  save.works.find((w) => w.workCode === code && w.artistId === artistId);

/* ---- 1) 预约真源：尾部定长槽 ---- */
{
  const save = await load('Story0019.sav');
  const cf280 = byCode(save, 'CF280');
  check(!!cf280 && cf280.name === '美味食品 垂涎篇', 'Story0019 CF280 筹备中通告存在', cf280?.name);
  const lead = cf280?.roles.find((r) => r.code === 'CF2801');
  // 老存档没有本体 [6][0] 槽，真源是尾部 [6][CF2801][18]；18 = 城仲瑄。
  check(lead?.reservedBy === '城仲瑄', 'Story0019 CF280 男角由城仲瑄预约（定长槽真源）', String(lead?.reservedBy));

  const s35 = await load('Story0035.sav');
  check(byCode(s35, 'CFAEU')?.roles.find((r) => r.code === 'CFAEU2')?.reservedBy === '衛亞',
    'Story0035 CFAEU 男角由卫亚预约');
  check(byCode(s35, 'SH154')?.roles.find((r) => r.code === 'SH154')?.reservedBy === '衛亞',
    'Story0035 SH154 外景主持由卫亚预约');
  // StarRole 占位名（新藝人）不是确认预约，游戏里实际无人接。
  const fs005 = byCode(s35, 'FS005');
  check(!!fs005 && fs005.roles.every((r) => !r.reservedBy || r.reservedBy !== '（新藝人）'),
    'Story0035 FS005 StarRole（新藝人）不当预约',
    fs005?.roles.map((r) => r.reservedBy).join(','));
}

/* ---- 2) 角色兜底：本体配对 + 作品成绩表定义 ---- */
{
  // 史蒂芬的《悲戀》=男主角、《書中自有顏如玉》=男配角（用户实机核对）。
  for (const name of ['Story0019.sav', 'Story0023.sav', 'Story0032.sav', 'Story0035.sav']) {
    const save = await load(name);
    const artist = save.artists.find((a) => a.name === '史蒂芬');
    if (!artist) { console.log(`OK   ${name} 无史蒂芬，跳角色真值`); continue; }
    const rows = save.works.filter((w) => w.artistId === artist.id && w.role);
    check(rows.length > 0, `${name} 早期作品有角色胶囊`, `${rows.length} 条`);
    check(rows.every((w) => ['男主角', '女主角', '男配角', '女配角', '主持人', '助理主持', '外景主持'].includes(w.role)),
      `${name} 角色胶囊都是标准角色名`, rows.slice(0, 3).map((w) => w.role).join('/'));
  }
  // 角色类型 → 性别是兜底筛选的基础，5/7 男、6/8 女。
  check(sweetRoleGender(5) === 'male' && sweetRoleGender(7) === 'male' &&
    sweetRoleGender(6) === 'female' && sweetRoleGender(8) === 'female',
    '角色类型 5/7 男、6/8 女');
}

/* ---- 3) 工作天数按剧集类型 / 节目型 ---- */
{
  const s19 = await load('Story0019.sav');
  // 电视剧：短片（爱情偶像剧）10/5、单元剧（侦探悬疑剧）20/5。
  const tvShort = byCode(s19, 'TVAE1');
  check(tvShort?.roles[0]?.workDays === 10 && tvShort?.roles[0]?.daysPerWeek === 5,
    '爱情偶像剧（短片）男女主 10/5', `${tvShort?.roles[0]?.workDays}/${tvShort?.roles[0]?.daysPerWeek}`);
  const tvUnit = byCode(s19, 'TV122');
  check(tvUnit?.roles[0]?.workDays === 20 && tvUnit?.roles[0]?.daysPerWeek === 5,
    '侦探悬疑剧（单元剧）20/5', `${tvUnit?.roles[0]?.workDays}/${tvUnit?.roles[0]?.daysPerWeek}`);
  // 主持：歌舞综艺 / 运动竞赛助理主持 10/2；采访报道外景主持 20/3。
  const host = byCode(s19, 'SHAAN');
  check(host?.roles[0]?.workDays === 10 && host?.roles[0]?.daysPerWeek === 2,
    '歌舞综艺助理主持 10/2', `${host?.roles[0]?.workDays}/${host?.roles[0]?.daysPerWeek}`);
  const s35 = await load('Story0035.sav');
  const outdoor = byCode(s35, 'SH154');
  check(outdoor?.roles[0]?.workDays === 20 && outdoor?.roles[0]?.daysPerWeek === 3,
    '采访报道外景主持 20/3', `${outdoor?.roles[0]?.workDays}/${outdoor?.roles[0]?.daysPerWeek}`);
  // 舞台剧 / 时装秀固定 40/5。
  const stage = byCode(s19, 'TH013');
  check(stage?.roles[0]?.workDays === 40 && stage?.roles[0]?.daysPerWeek === 5,
    '舞台剧 40/5', `${stage?.roles[0]?.workDays}/${stage?.roles[0]?.daysPerWeek}`);
  const fashion = byCode(s19, 'FS004');
  check(fashion?.roles[0]?.workDays === 40 && fashion?.roles[0]?.daysPerWeek === 5,
    '时装秀 40/5', `${fashion?.roles[0]?.workDays}/${fashion?.roles[0]?.daysPerWeek}`);
  // shootableDays(剩余天数, 每周上限)＝按整周折算还能排几天：20 天=3 周×5、10 天=2 周×2。
  check(shootableDays(20, 5) === 15 && shootableDays(10, 2) === 4,
    '可拍天数按整周折算', `${shootableDays(20, 5)}/${shootableDays(10, 2)}`);
}

/* ---- 4) 通告统计：已发行 + 日期排序 + 角色 ---- */
{
  for (const name of ['Auto.sav', 'Story0007.sav', 'Story0017.sav', 'Story0019.sav',
    'Story0023.sav', 'Story0035.sav', 'Story0052.sav', 'Story0056.sav', 'Story0065.sav']) {
    const save = await load(name);
    let desc = 0;
    for (let i = 1; i < save.works.length; i += 1) {
      const a = save.works[i - 1];
      const b = save.works[i];
      if (a.year > b.year || (a.year === b.year && (a.month > b.month ||
        (a.month === b.month && a.day > b.day)))) desc += 1;
    }
    check(desc === 0, `${name} 通告统计按发生日期升序`, `${desc} 处倒序`);
    // 游戏记事只留序号、没留明细的老作品用「存档未留存明细」占位（带 seq 排回位置）；
    // 无码行也可能是演唱会 / 活动（noticeIndex 7）。有码的行必须有名字。
    check(save.works.every((w) => w.workCode ? !!w.workName : !!w.workName &&
      (w.noticeIndex === 7 || (w.workName === '（存档未留存明细）' && w.seq > 0))),
      `${name} 明细有码则有名、无码是占位或活动`);
  }
  const s19 = await load('Story0019.sav');
  const weiya = s19.artists.find((a) => a.id === 16);
  check(weiya?.name === '衛亞', 'Story0019 艺人 16 = 衛亞', weiya?.name);
  check(!!workOf(s19, 'MV006', 16), 'Story0019 衛亞《新精靈王》在明细里');
  check(workOf(s19, 'MV006', 16)?.role === '男主角', '《新精靈王》衛亞=男主角（本体配对）',
    workOf(s19, 'MV006', 16)?.role);
}

/* ---- 5) 停止接取 / 团体 / 场景 / 道具上限 ---- */
{
  const s19 = await load('Story0019.sav');
  check(byCode(s19, 'CF280')?.status === 'closing', 'Story0019 CF280 停止接取', byCode(s19, 'CF280')?.status);
  check(byCode(s19, 'FS004')?.status === 'expired', 'Story0019 FS004 已过期', byCode(s19, 'FS004')?.status);
  const team = s19.teams.find((t) => t.code === 101);
  check(team?.name === '又怎么了', 'Story0019 团体 101 = 又怎么了', team?.name);

  const s52 = await load('Story0052.sav');
  check(s52.teams.find((t) => t.code === 101)?.name === '稀奇古怪', 'Story0052 团体 101 = 稀奇古怪');
  // 场景锁定六座，顺序与冻结真值 0101000000（东京/巴黎）对应。
  const scenes = s52.scenes.map((s) => `${s.name}:${s.unlocked ? 1 : 0}`).join(' ');
  check(s52.scenes.length === 6, '甜站只显示六座国际场景', String(s52.scenes.length));
  check(s52.scenes.every((s) => ['东京', '好莱坞', '巴黎', '纽约', '伦敦', '米兰'].includes(s.name)),
    '甜站场景名在六座白名单内', scenes);
  // 后期存档人气 capped 到 999999 不能当噪声丢掉艺人块。
  check(s52.artists.length >= 4 && s52.artists.some((a) => a.name === '慕容和希'),
    'Story0052 社交 capped 时艺人卡仍全读出', `${s52.artists.length} 人`);

  // 风险口径： slack=可拍天数-需要天数；<0=late，≤5=tight，>5=ok，每周上限无效=unknown。
  check(sweetRiskOf(20, 26, 5) === 'ok' && sweetRiskOf(20, 20, 5) === 'tight' &&
    sweetRiskOf(20, 15, 5) === 'late' && sweetRiskOf(20, 10, 0) === 'unknown',
    '拍摄风险分级', `${sweetRiskOf(20, 26, 5)}/${sweetRiskOf(20, 20, 5)}/${sweetRiskOf(20, 15, 5)}`);
}

console.log('');
console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
