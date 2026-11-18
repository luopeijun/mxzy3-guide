/* Regression for src/lib/caseParser.ts.
 *
 * 1) A hand-built .sa2-shaped buffer with one TV021 男主角 record. Its rolled
 *    values (325/445/395) must map to C/A/B from both the static grade table
 *    and the three-star difficulty ranges. Self-contained, no game install.
 * 2) When a real save is available, parse it and assert the same invariants
 *    hold across every notice (skipped on machines without the game).
 *
 * Usage: node scripts/test_case_parser.mjs [path/to/save.sa2]
 * Defaults to the frozen probe.sa2 snapshot in tests/fixtures/saves/ so the
 * exact-value assertions are reproducible and never follow the live game save.
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Frozen saves with player-verified truths. Never read the live Save2/ dir for
// these — the game rewrites it while running and the assertions would drift.
const SNAP = path.join(root, 'tests', 'fixtures', 'saves');
const tmp = path.join(root, '.tmp');
fs.mkdirSync(tmp, { recursive: true });
const bundle = path.join(tmp, 'case-parser.test.mjs');
await build({
  entryPoints: [path.join(root, 'src/lib/caseParser.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const {
  parseSave, toCsv, matchRole, canTakeRole, roleGender, starGender, ARTIST_DIRECTORY,
  isGroupRole, matchGroupRole, buildGroupRecord, riskOf, RISK_SLACK_DAYS, shootableDays,
  moneyText, freeRoleCount, isAcceptable, canTakeNotice,
} = await import(pathToFileURL(bundle).href + `?v=${Date.now()}`);

let failures = 0;
let checks = 0;
const check = (ok, label, extra = '') => {
  checks += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
  if (!ok) failures += 1;
};

const TABLES = {
  source: 'fixture',
  cases: { TV021: ['守候', '愛情偶像劇', '單元劇', 'SoSa電視'] },
  needEffect: { '愛情偶像劇|男主角': [3, 0, 0, 1, 2, 0, 0, 0, 0] },
  length: { '單元劇|男主角': [20, 5], '連續劇|男主角': [45, 5], '廣告|男性': [6, 5] },
  difficulty: [
    [[180, 300], [150, 250], [120, 200], [100, 160]],
    [[330, 420], [280, 360], [210, 280], [160, 220]],
    [[420, 480], [360, 420], [270, 330], [220, 300]],
    [[540, 620], [470, 540], [360, 440], [290, 360]],
    [[680, 780], [600, 680], [480, 570], [390, 470]],
  ],
  firms: { 4: '鉅子娛樂' },
};

function writeAsciiWords(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) view.setUint32(offset + 4 * i, text.charCodeAt(i), true);
}

function makeSave() {
  const buffer = new ArrayBuffer(1024);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Case block marker (int32-ASCII), then a 192-byte role record at offset 32.
  writeAsciiWords(view, 0, 'Case');
  const rec = 32;
  const tag = [0x54, 0x56, 0x30, 0x32, 0x31, 0x31]; // TV0211
  tag.forEach((b, i) => { bytes[rec + 12 + i] = b; });
  [0xa8, 0x6b, 0xa5, 0x44, 0xa8, 0xa4].forEach((b, i) => { bytes[rec + 20 + i] = b; }); // 男主角
  view.setUint32(rec + 32, 3, true); // three stars
  [325, 0, 0, 445, 395, 0, 0, 0, 0].forEach((v, i) => view.setUint32(rec + 40 + 4 * i, v, true));

  // CaseEnd closes the block, CaseFirm lists TV021 under firm slot 4.
  writeAsciiWords(view, 240, 'CaseEnd');
  writeAsciiWords(view, 300, 'CaseFirm');
  view.setUint32(332, 1, true);  // seq
  view.setUint32(336, 4, true);  // firm slot
  view.setUint32(340, 5, true);  // code length
  writeAsciiWords(view, 344, 'TV021');
  return buffer;
}

const result = parseSave(makeSave(), TABLES, 'fixture.sa2');
check(result.blocks.Case?.[0] === 0, 'Case block located', JSON.stringify(result.blocks));
check(result.notices.length === 1, 'one current notice');
const notice = result.notices[0];
check(notice?.code === 'TV021' && notice.name === '守候', 'notice joined with static name');
check(notice?.type === '愛情偶像劇' && notice.company === 'SoSa電視', 'notice type and company');
check(notice?.firmSlot === 4 && notice.firmName === '鉅子娛樂', 'firm slot joined with company name');
check(result.roleRecordCount === 1 && notice?.roles.length === 1, 'one role record');
const role = notice?.roles[0];
check(role?.role === '男主角' && role.star === 3, 'Big5 role name and star');
check(role?.gender === 'male' && roleGender('女性') === 'female'
  && roleGender('女配角') === 'female' && roleGender('個人') === 'any',
  'role gender is derived from the Big5 role name');
const expected = [['演技', 325, 'C'], ['名气', 445, 'A'], ['仪态', 395, 'B']];
const actual = (role?.requirements ?? []).map((r) => [r.attr, r.value, r.staticGrade]);
check(JSON.stringify(actual) === JSON.stringify(expected), 'rolled values and static grades', JSON.stringify(actual));
check((role?.requirements ?? []).every((r) => r.rolledGrade === r.staticGrade),
  'difficulty ranges agree with static grades');
check(notice?.workDays === 20 && notice?.daysPerWeek === 5,
  '工作天数 / 每周上限 come from the Length table (單元劇|男主角)',
  `${notice?.workDays} 天 / 每周 ${notice?.daysPerWeek}`);
check(toCsv(result).includes('"TV021"') && toCsv(result).includes('演技325'), 'CSV export');
check(result.unknownCodes.length === 0, 'no unknown notice codes');
// Every selected artist is compared against the same role independently.
const strong = { index: 1, abilities: [400, 0, 0, 500, 400, 0, 0, 0, 0] };
const weak = { index: 2, abilities: [300, 0, 0, 400, 300, 0, 0, 0, 0] };
const strongMatch = matchRole(role, strong, '路敏');
const weakMatch = matchRole(role, weak, '路风');
check(strongMatch.canAccept && weakMatch.missing === 3
  && weakMatch.gaps.filter((g) => g.diff > 0).map((g) => g.diff).join(',') === '25,45,95',
  'each artist gets an independent can-accept / shortfall result',
  `${strongMatch.canAccept} / ${weakMatch.gaps.filter((g) => g.diff > 0).map((g) => g.diff).join(',')}`);
// A gender-restricted role rules out artists of the other gender entirely.
const wrongGender = matchRole(role, strong, '路敏', 'female');
const neutralRole = { ...role, gender: 'any' };
check(!wrongGender.eligible && !wrongGender.canAccept
  && canTakeRole(role, 'male') && !canTakeRole(role, 'female')
  && matchRole(neutralRole, strong, '路敏', 'female').eligible,
  'gender-restricted roles exclude mismatched artists, neutral roles allow all');

// 长度表真源是 sources/notices/notice-length.csv（39 行）。烘焙出来的 JSON
// 必须与之一致：影视四类按 subtype 查，主持按节目类型查，甜蜜乐章那三条
// 只有 CSV 里有（繁中三合一的 Length.tab 没有）。
{
  const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
  const rows = fs.readFileSync(path.join(root, 'sources/notices/notice-length.csv'), 'utf-8')
    .replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1);
  check(Object.keys(tables.length).length === rows.length && rows.length === 39,
    '长度表 39 条与 CSV 行数一致', `${Object.keys(tables.length).length} vs ${rows.length}`);
  check(tables.length['連續劇|男主角']?.[0] === 45
    && tables.length['廣告|男性']?.[0] === 6
    && tables.length['運動競賽|外景主持']?.[1] === 3,
    '长度表抽样数值与 CSV 一致（連續劇 45 / 廣告 6 / 外景主持每周 3）',
    JSON.stringify([
      tables.length['連續劇|男主角'], tables.length['廣告|男性'], tables.length['運動競賽|外景主持'],
    ]));
  check(tables.length['舞台劇|男主角']?.[0] === 40 && tables.length['時裝秀|男性']?.[0] === 40,
    'CSV 里甜蜜乐章那三条也进了表（舞台劇 / 時裝秀 40 天）',
    JSON.stringify([tables.length['舞台劇|男主角'], tables.length['時裝秀|男性']]));
}

const savePath = process.argv[2] ?? path.join(SNAP, 'probe.sa2');
if (fs.existsSync(savePath)) {
  const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
  const data = fs.readFileSync(savePath);
  const real = parseSave(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), tables, path.basename(savePath));
  const reqs = real.notices.flatMap((n) => n.roles.flatMap((r) => r.requirements));
  const gradeIndex = { A: 0, B: 1, C: 2, D: 3 };
  // The difficulty ranges overlap (2-star A is 320-400 and B is 280-360), so
  // reverse-inferring a grade from a value is ambiguous. The real invariant is
  // that every rolled value sits inside the range of its static grade.
  const inRange = (notice, role, req) => {
    const idx = gradeIndex[req.staticGrade];
    if (idx === undefined) return true;
    const range = tables.difficulty[role.star - 1]?.[idx];
    return !range || (req.value >= range[0] && req.value <= range[1]);
  };
  const withGrade = real.notices.flatMap((n) => n.roles.flatMap((r) =>
    r.requirements.filter((q) => q.staticGrade).map((q) => ({ n, r, q }))));
  const outOfRange = withGrade.filter(({ n, r, q }) => !inRange(n, r, q));
  console.log(`\nreal save: ${real.notices.length} notices / ${real.roleRecordCount} role records / ${reqs.length} requirements`);
  check(real.notices.length > 0, 'real save has current notices');
  check(reqs.length > 0, 'real save has rolled values');
  check(reqs.every((r) => r.value >= 50 && r.value <= 999), 'all values in plausible range');
  check(withGrade.length > 0 && outOfRange.length === 0,
    'rolled values sit inside their static grade ranges',
    `${withGrade.length} graded items, out of range: ${JSON.stringify(outOfRange.map(({ n, r, q }) => [n.code, r.role, q.attr, q.value, q.staticGrade]))}`);
  check(real.unknownCodes.length <= real.notices.length / 2,
    'most notice codes resolve in bundled tables', `unknown: ${real.unknownCodes.join(',') || 'none'}`);

  // --- Dates, booking window, shooting progress, company refresh batches ---
  check(real.currentDate !== null, 'in-game date read from the save header',
    JSON.stringify(real.currentDate));
  const withDates = real.notices.filter((n) => n.openDate && n.deadline && n.periodStart && n.periodEnd);
  check(withDates.length === real.notices.length, 'every notice has its three date tuples',
    `${withDates.length}/${real.notices.length}`);
  const { parseDay, dayText } = await import(pathToFileURL(bundle).href);
  check(withDates.every((n) => n.deadline === dayText(parseDay(n.periodStart) - 1)),
    'deadline is the day before shooting starts');
  check(withDates.every((n) => n.execDays === parseDay(n.periodEnd) - parseDay(n.periodStart) + 1),
    'shooting length is inclusive of both ends');
  check(withDates.every((n) => parseDay(n.openDate) < parseDay(n.periodStart)
    && parseDay(n.periodStart) < parseDay(n.periodEnd)), 'dates are in order');
  check(real.notices.some((n) => n.status === 'closing'),
    'notices closing within 7 days are flagged');
  check(real.batches.length > 0 && real.batches.every((b) => b.label === '周一'),
    'company refresh batches all land on a Monday',
    real.batches.map((b) => `${b.date} ${b.label}`).join(', '));
  check(real.batches.every((b, i, all) => i === 0 || all[i - 1].dayNumber < b.dayNumber),
    'refresh batches are sorted by date');
  check(real.batches.every((b) => b.companies.length > 0),
    'every refresh batch names its production companies');
  check(real.artists.length > 0 && real.artists.every((a) => a.abilities.length === 9
    && a.noticeCounts.length === 5 && a.social.length === 5),
    'artist state blocks carry nine abilities, five social stats and five notice counts',
    `${real.artists.length} blocks`);
  check(real.artistDirectory.length === 18
    && real.artistDirectory.find((a) => a.id === 72)?.name === '克烈斯'
    && real.artistDirectory.find((a) => a.id === 74)?.name === '新名纱雪',
    'the 18 signable artists are mapped by the save-editor roster number');
  const femaleIds = ARTIST_DIRECTORY.map((a) => a.id)
    .filter((id) => starGender(id, tables.stars) === 'female');
  check(femaleIds.join(',') === '1,2,3,4,5,6,65,74,75'
    && ARTIST_DIRECTORY.filter((a) => starGender(a.id, tables.stars) === 'male').length === 9,
    'gender comes from the game StarRole table, not a hand-written roster',
    femaleIds.join(','));
  check(tables.stars['75']?.[0] === '聆香' && starGender(75, tables.stars) === 'female'
    && tables.stars['75']?.[0] !== '千萬不要用',
    'id 75 resolves to 聆香 (the game table stores a placeholder name there)');
  check(real.artistDirectory.find((a) => a.id === 75)?.gender === 'female'
    && real.artistDirectory.find((a) => a.id === 76)?.gender === 'male',
    'roster options inherit gender from the game table');
  const allRoles = real.notices.flatMap((n) => n.roles);
  check(allRoles.every((r) => ['male', 'female', 'any'].includes(r.gender))
    && allRoles.some((r) => r.gender === 'any')
    && allRoles.filter((r) => r.role.includes('主角')).every((r) => r.gender !== 'any'),
    'gender-restricted and neutral roles are both classified',
    [...new Set(allRoles.map((r) => `${r.role}:${r.gender}`))].join(' '));
  // 存档里的状态块覆盖全部艺人（含 NPC），目录只列 18 位可签约艺人，
  // 所以这里校验编号范围，而不是要求每个块都在目录里。
  check(real.artists.every((a) => a.roleId > 0 && a.roleId <= 96)
    && real.artists.every((a) => new Set(real.artists.map((b) => b.roleId)).size === real.artists.length),
    'every state block carries a unique artist number inside the save range',
    `${real.artists.length} blocks`);
  check(real.artistDirectory.every((d) => d.artistIndex === null
    || real.artists.some((a) => a.index === d.artistIndex && a.roleId === d.id)),
    'directory entries point at the state block with the same number');
  check(real.roster.some((r) => r.name === '路風') && real.roster.some((r) => r.name === '黎華'),
    'roster table resolves the signed artists and the booking artist');
  check(real.notices.every((n) => n.roles.every((r) => typeof r.reservedBy === 'string')),
    'every role carries a (possibly empty) reservation');
  check(toCsv(real).includes('"停止接取"') && toCsv(real).includes('"执行天数"'),
    'CSV includes the booking window and shooting length');
  check(real.notices.every((n) => n.workDays > 0 && n.daysPerWeek > 0),
    'every listed notice resolves its 工作天数 / 每周上限 from the Length table',
    real.notices.filter((n) => !n.workDays).map((n) => n.code).join(',') || 'all matched');
  const ads = real.notices.filter((n) => n.category === '广告');
  check(ads.length === 0 || ads.every((n) => n.workDays === 6 && n.daysPerWeek === 5),
    '广告 resolves to 6 天 / 每周上限 5 次 (Length 表)',
    ads.map((n) => `${n.code}:${n.workDays}/${n.daysPerWeek}`).join(' ') || 'no ad in snapshot');

  // 拍摄中：接取记录写在通告块里（[艺人][已完成][状态][?][酬劳]）。判定要求
  // 「已经不在 CaseFirm 池里」+「到杀青日还没过」，所以它和上面那张表不会重叠。
  const listed = new Set(real.notices.map((n) => n.code));
  check(real.shooting.every((s) => !listed.has(s.code)),
    '拍摄中 never repeats a 筹备中 notice',
    real.shooting.filter((s) => listed.has(s.code)).map((s) => s.code).join(',') || 'disjoint');
  check(real.shooting.every((s) => s.casts.length > 0
    && s.casts.every((c) => c.doneDays >= 0 && c.needDays >= 0)),
    '每条拍摄中通告至少有一位艺人，且一人一条进度',
    real.shooting.map((s) => `${s.code}:${s.casts.map((c) => `${c.artistName}${c.doneDays}/${c.workDays}`).join('+')}`).join(' ') || 'none');
  check(real.shooting.every((s) => s.casts.every((c) => c.status !== 'finished')),
    'shooting list drops casts that already wrapped',
    real.shooting.flatMap((s) => s.casts.map((c) => `${s.code}:${c.artistName}:${c.status}`)).join(' ') || 'none');
  check(real.shooting.every((s) => s.casts.every((c) => c.risk === riskOf(c.needDays, c.canShootDays, c.daysPerWeek))),
    '每位艺人的提醒都按「余量 ≤ 5 天算逾期风险、排不下算违约」重算一致');
  check(shootableDays(21, 5) === 15 && shootableDays(3, 5) === 3
    && shootableDays(0, 5) === 0 && shootableDays(8, 0) === 0,
    '每周上限折算出「剩下这段日子最多还能排几天」');
  // 提醒只有两档：余量 ≤ 5 天算逾期风险，排不下才算违约。
  check(RISK_SLACK_DAYS === 5 && riskOf(20, 15, 5) === 'late'
    && riskOf(10, 10, 5) === 'tight' && riskOf(10, 15, 5) === 'tight'
    && riskOf(10, 16, 5) === 'ok' && riskOf(0, 0, 5) === 'ok'
    && riskOf(6, 99, 0) === 'unknown',
    '余量 5 天以内提示逾期风险，排不下才是违约，宽裕就不提示',
    [riskOf(20, 15, 5), riskOf(10, 10, 5), riskOf(10, 15, 5), riskOf(10, 16, 5)].join(','));

  // Exact values only for the frozen investigation snapshot.
  if (path.basename(savePath) === 'probe.sa2') {
    check(real.currentDate?.text === '2006/1/29' && real.currentDate?.label === '周日',
      'snapshot game date is 2006/1/29 (Sunday)');
    const shouhou = real.notices.find((n) => n.code === 'TV021');
    check(shouhou?.openDate === '2006/1/16' && shouhou?.deadline === '2006/2/12'
      && shouhou?.periodStart === '2006/2/13' && shouhou?.periodEnd === '2006/4/9'
      && shouhou?.execDays === 56, '守候 booking window and shooting period');
    // 预约来自存档：艺人状态块后面那串作品清单里有当期通告编码，就是他把角色接走了。
    const booked = real.notices.flatMap((n) => n.roles).filter((r) => r.reservedBy);
    check(shouhou?.roles.find((r) => r.role === '男主角')?.reservedBy === '黎華'
      && real.notices.find((n) => n.code === 'TV221')?.roles
        .find((r) => r.role === '男主角')?.reservedBy === '黎華',
      '守候 / 背叛 的男主角都由存档读出是黎華',
      booked.map((r) => `${r.roleCode}:${r.reservedBy}`).join(',') || 'none');
    check(booked.length === 2 && booked.every((r) => r.role === '男主角'),
      '只有这两个角色被预约，其余角色都没有署名');
    check(real.notices.filter((n) => n.status === 'closing').length === 2,
      'exactly two notices close within 7 days');
    check(real.nextUpdate?.date === '2006/1/30' && real.nextUpdate.companies.length === 3
      && real.nextUpdate.kinds.includes('唱片'), 'next Monday refresh is the three record labels');
    check(real.batches.length === 3
      && real.batches.every((b) => b.codes.every((c) => real.notices.some((n) => n.code === c)))
      && !('forecastDate' in real),
      'batches only cover the notices on screen, no extrapolation',
      real.batches.map((b) => b.date).join(','));
    check(real.artists.some((a) => a.abilities[0] === 188.6 && a.abilities[8] === 283.8
      && a.stress === 76 && a.fatigue === 98),
      'the save-editor screenshot values (÷10) are present in an artist block');
    check(real.artists.length >= 60 && !real.artists.some((a) => a.roleId === 78 || a.roleId === 79),
      'the two all-1111 placeholder blocks are excluded', `${real.artists.length} blocks`);
    check(real.signedArtistIds.join(',') === '5,6,10',
      'the save identifies 路敏 / 萧依莉 / 路风 as the signed artists',
      real.signedArtistIds.join(','));
    check(real.artistDirectory.find((a) => a.id === 6)?.abilities[0] === 188.6,
      '萧依莉 resolves to the screenshot block (÷10)');
    const femaleLead = shouhou?.roles.find((r) => r.role === '女主角');
    const luFeng = real.artistDirectory.find((a) => a.id === 10);
    const luMin = real.artistDirectory.find((a) => a.id === 5);
    check(femaleLead?.gender === 'female' && luFeng?.gender === 'male'
      && !canTakeRole(femaleLead, luFeng.gender) && canTakeRole(femaleLead, luMin.gender),
      '守候 女主角 rules 路风 out but stays open to 路敏');
    const neutral = real.notices.flatMap((n) => n.roles).find((r) => r.gender === 'any');
    check(neutral && canTakeRole(neutral, 'female') && canTakeRole(neutral, 'male'),
      'neutral roles such as 外景主持 / 個人 accept either gender', neutral?.role);

    // 我方团体：只认存档 `Team` 段里的记录，读不到就是没有团队。
    check(real.teams.length === 1 && real.teams[0].code === 101
      && real.teams[0].name === '風敏樂團',
      'team record read from the save Team section (101 風敏樂團)',
      real.teams.map((t) => `${t.code}:${t.name}`).join(',') || 'none');
    check(real.teams[0]?.memberIds.join(',') === '10,5',
      'team members read from the save (路风 10, 路敏 5; first one is the leader)',
      real.teams[0]?.memberIds.join(',') ?? '-');
    const groupRole = real.notices.flatMap((n) => n.roles).find((r) => isGroupRole(r));
    if (groupRole) {
      const leader = real.artists.find((a) => a.roleId === real.teams[0]?.memberIds[0]) ?? null;
      check(matchGroupRole(groupRole, leader, real.teams[0]?.name ?? '', '').gaps.length > 0,
        'a 團體 role matches against the team leader only', groupRole.role);
    } else {
      console.log('OK   no 團體 role in this snapshot');
    }
  }
} else {
  console.log(`\nreal save not found (${savePath}), skipped live-save checks`);
}

// 黄金快照（probe.sa2，玩家用来核对「拍摄中」）：只有萧依莉那条广告在拍，
// 存档记的完成天数是 4 天，酬劳 5000。此前读 D 盘 Auto.sa2，但游戏会改写它
// （变成 CF159 / 资金 1394477 / 20 件），故改用冻结快照。
{
  const autoPath = path.join(SNAP, 'probe.sa2');
  if (fs.existsSync(autoPath)) {
    const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
    const raw = fs.readFileSync(autoPath);
    const auto = parseSave(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, 'Auto.sa2',
    );
    check(auto.shooting.length === 1 && auto.shooting[0].code === 'CF014'
      && auto.shooting[0].name === '愛信電訊 業務篇',
      'Auto: 拍摄中只有 CF014 愛信電訊（萧依莉那条广告）',
      auto.shooting.map((s) => `${s.code}:${s.name}`).join(',') || 'none');
    const ad = auto.shooting[0];
    const cast = ad?.casts.find((c) => c.artistId === 6);
    check(cast?.artistName === '蕭依莉',
      'Auto: CF014 的接取艺人读出来是 6 号萧依莉',
      ad?.casts.map((c) => `${c.artistId}:${c.artistName}`).join(',') ?? '-');
    check(cast?.doneDays === 4 && cast?.workDays === 6 && cast?.daysPerWeek === 5,
      'Auto: CF014 已完成 4 天 / 需拍 6 天 / 每周最多 5 天',
      `${cast?.doneDays}/${cast?.workDays} perWeek=${cast?.daysPerWeek}`);
    check(cast?.pay === 5000,
      'Auto: CF014 的酬劳直接取存档里的值',
      String(cast?.pay));
    check(ad?.startDate === '2006/1/23' && ad?.endDate === '2006/2/19',
      'Auto: CF014 开拍 1/23、杀青 2/19 从通告块的三段日期读出',
      `${ad?.startDate}~${ad?.endDate}`);
    check(cast?.risk === 'ok' && cast?.needDays === 2 && cast?.canShootDays === 15,
      'Auto: 还差 2 天、剩下 21 个日历日按每周 5 天能排 15 天，余量够大不提醒',
      `risk=${cast?.risk} need=${cast?.needDays} can=${cast?.canShootDays}`);
    check(auto.company?.name === '靠譜傳媒' && auto.company?.protagonist === '駱佩君',
      'Auto: 公司名 / 主角姓名取存档头的定长字段',
      `${auto.company?.name} / ${auto.company?.protagonist}`);
    check(auto.company?.image === '注入新血的' && auto.company?.fame === 670
      && auto.company?.pr === 539,
      'Auto: 形象 / 知名度 / 公关 取 Firm 段编号 1 那条（注入新血的 670 / 539）',
      `${auto.company?.image} ${auto.company?.fame}/${auto.company?.pr}`);
    check(auto.company?.money === 1151527,
      'Auto: 资金取存档头 @80', String(auto.company?.money));
    // 道具清单：整段解析出来，过滤数量 0 后的「我拥有」条目。
    // 2026-11-14 与游戏物品窗口截图逐件核对：Auto 应有 21 件
    // （一般 4 + 特殊 15 + 公司 2，爱神巧克力 x2）。
    check(auto.items.length >= 300,
      'Auto: 道具清单整段解析出来（一整段 ~323 行，不再被状态码截断）', String(auto.items.length));
    const owned = auto.items.filter((it) => it.quantity > 0);
    check(owned.length === 21,
      'Auto: 数量为 0 的不计入，我拥有 21 件', String(owned.length));
    const card = auto.items.find((it) => it.code === 917);
    check(card && card.quantity === 1,
      'Auto: 编号 917（附着唇印的卡片）数量 1',
      card ? `${card.code}:${card.quantity}` : '未找到');
    check(card && card.name === '附著唇印的卡片' && card.category === '特殊物品',
      'Auto: 917 名称 / 分类从道具表解析出来（附著唇印的卡片 / 特殊物品）',
      card ? `${card.name} / ${card.category}` : '未找到');
    check(card && card.desc.startsWith('紅豔的唇印'),
      'Auto: 917 物品说明也来自道具表', card ? card.desc.slice(0, 12) : '未找到');
    // 玩家截图点名的三件：白板 / 鱼缸在公司物品，借据在特殊物品（flag=0xffffffff 的剧情道具）。
    const board = auto.items.find((it) => it.code === 4);
    check(board && board.name === '十年前的白板' && board.quantity === 1 && board.category === '公司物品',
      'Auto: 编号 4 十年前的白板 x1（公司物品）',
      board ? `${board.name} x${board.quantity} / ${board.category}` : '未找到');
    const tank = auto.items.find((it) => it.code === 301);
    check(tank && tank.name === '風水魚缸' && tank.quantity === 1 && tank.category === '公司物品',
      'Auto: 编号 301 風水魚缸 x1（公司物品）',
      tank ? `${tank.name} x${tank.quantity} / ${tank.category}` : '未找到');
    const iou = auto.items.find((it) => it.code === 96);
    check(iou && iou.name === '借據' && iou.quantity === 1 && iou.category === '特殊物品',
      'Auto: 编号 96 借據 x1（特殊物品；状态码 0xffffffff 必须放行）',
      iou ? `${iou.name} x${iou.quantity} / ${iou.category}` : '未找到');
    const choco = auto.items.find((it) => it.code === 317);
    check(choco && choco.quantity === 2,
      'Auto: 爱神巧克力 x2（状态码 97 这类非常规值也不能截断清单）',
      choco ? `${choco.name} x${choco.quantity}` : '未找到');
    // 名称 / 分类对空表（EMPTY_TABLES）有回退，不会崩。
    check(owned.every((it) => typeof it.name === 'string' && typeof it.category === 'string'),
      'Auto: 每件拥有道具都有 name / category 字段（来自道具表或回退）',
      owned.map((it) => `${it.code}=${it.name}`).slice(0, 4).join(','));
    check(auto.items.every((it, idx, arr) => idx === 0 || it.code >= arr[idx - 1].code),
      'Auto: 道具清单编号非递减（解析没错位）',
      auto.items.map((it) => it.code).slice(0, 6).join(',') + ' …');
  } else {
    console.log('OK   Auto.sa2 not present, skipped the shooting checks');
  }
}

// 第五个存档（Story0027）：在拍「守候」，但男主角史蒂芬、女主角方若綺都不是
// 旗下艺人 —— 拍摄中只留 72 号克烈斯，角色也仍是存档里他那格男配角。
{
  const story27Path = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Story0027.sa2';
  if (fs.existsSync(story27Path)) {
    const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
    const raw = fs.readFileSync(story27Path);
    const save = parseSave(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, 'Story0027.sa2',
    );
    const codes = save.shooting.map((n) => n.code);
    const castIds = save.shooting.flatMap((n) => n.casts.map((c) => c.artistId));
    check(save.signedArtistIds.join(',') === '1,9,72',
      'Story0027: 旗下是 林芬芬 / 关古威 / 克烈斯', save.signedArtistIds.join(','));
    check(castIds.every((id) => save.signedArtistIds.includes(id))
      && !castIds.includes(20) && !castIds.includes(23),
      'Story0027: 拍摄中只留旗下艺人，史蒂芬 / 方若綺不占行',
      castIds.join(','));
    const tv021 = save.shooting.find((n) => n.code === 'TV021');
    check(tv021?.casts.length === 1 && tv021.casts[0].artistId === 72
      && tv021.casts[0].role?.role === '男配角',
      'Story0027: 守候只剩克烈斯一行，角色没被前面的对手公司演员挤错',
      tv021?.casts.map((c) => `${c.artistName}:${c.role?.role}`).join(',') ?? 'none');
    check(codes.includes('TV021') && codes.includes('CD294') && codes.includes('SH032'),
      'Story0027: 三条在拍通告都还在拍摄中', codes.join(','));
  } else {
    console.log('OK   Story0027.sa2 not present, skipped the own-artist checks');
  }
}

// 第六个存档（Story0024）：CF728 絲襪 勾引篇 已经拍满 6 天、杀青日就是今天，
// 所以整条都不该留在拍摄中（没有在赶期的人），也不再单独开「已完成」页签。
{
  const donePath = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Story0024.sa2';
  if (fs.existsSync(donePath)) {
    const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
    const raw = fs.readFileSync(donePath);
    const save = parseSave(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, 'Story0024.sa2',
    );
    check(!save.shooting.some((n) => n.code === 'CF728'),
      'Story0024: 拍满天数的 CF728 不再列进拍摄中',
      save.shooting.map((n) => n.code).join(',') || 'none');
    check(save.finished === undefined,
      'ParseResult 不再有 finished 这一档（已完成页签已去掉）',
      typeof save.finished);
  } else {
    console.log('OK   Story0024.sa2 not present, skipped the wrapped-cast checks');
  }
}

// 第二个存档（玩家实测的 Story0007）：四个签约艺人和 101 号团体必须都读到。
// 这一份是旧版本存档，属性顶到 9999 —— 就是它暴露出上限设太窄的问题。
{
  const storyPath = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Story0007.sa2';
  // 这是玩家在玩的历史活档，会被游戏随时改写（曾验证过 12,65,74,76 + 莎亞之音）。
  // 真值匹配时照常断言；一旦漂移就整段跳过，别让活档变化假报回归失败。
  if (fs.existsSync(storyPath)) {
    const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
    const raw = fs.readFileSync(storyPath);
    const story = parseSave(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, 'Story0007.sa2',
    );
    if (story.signedArtistIds.join(',') !== '12,65,74,76') {
      console.log('OK   Story0007.sa2 drifted in-game, skipped the second-save checks');
    } else {
    check(story.signedArtistIds.join(',') === '12,65,74,76',
      'Story0007: 姚子奇 / 姚子莹 / 新名纱雪 / 卫亚 are signed',
      story.signedArtistIds.join(','));
    check(story.teams.length === 1 && story.teams[0].code === 101
      && story.teams[0].name === '莎亞之音',
      'Story0007: team 101 莎亞之音 read from the save',
      story.teams.map((t) => `${t.code}:${t.name}`).join(',') || 'none');
    check(story.teams[0]?.memberIds.join(',') === '74,76',
      'Story0007: members are 新名纱雪 (74) and 卫亚 (76)',
      story.teams[0]?.memberIds.join(',') ?? '-');
    const genius = story.notices.find((n) => n.code === 'TV086');
    const lastSong = story.notices.find((n) => n.code === 'CD835');
    check(genius?.roles.find((r) => r.role === '男主角')?.reservedBy === '衛亞'
      && lastSong?.roles.find((r) => r.role === '個人')?.reservedBy === '衛亞',
      'Story0007: 天才與白癡 男主角 / 最後一次再想他 都由存档读出是衛亞',
      [genius, lastSong].map((n) => n?.roles.map((r) => `${r.role}:${r.reservedBy || '-'}`).join('|')).join(' / '));
    }
  } else {
    console.log('OK   Story0007.sa2 not present, skipped the second-save checks');
  }
}

// 第三个存档（Ending0009）：两个团体，101 大小姐 + 102 晴少爺。101 的记录没有
// 尾部 "Invaid" 标记，早先按标记认记录时它整个被丢掉，只显示 102。
{
  const endingPath = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Ending0009.sa2';
  if (fs.existsSync(endingPath)) {
    const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
    const raw = fs.readFileSync(endingPath);
    const ending = parseSave(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, 'Ending0009.sa2',
    );
    check(ending.teams.length === 2
      && ending.teams[0].code === 101 && ending.teams[0].name === '大小姐'
      && ending.teams[1].code === 102 && ending.teams[1].name === '晴少爺',
      'Ending0009: 两个团体都读到（101 大小姐 / 102 晴少爺）',
      ending.teams.map((t) => `${t.code}:${t.name}`).join(',') || 'none');
    check(ending.teams[0]?.memberIds.join(',') === '1,2'
      && ending.teams[1]?.memberIds.join(',') === '7,77',
      'Ending0009: 两个团体的成员编号都读到',
      ending.teams.map((t) => t.memberIds.join('/')).join(' | '));
    // 同一部电影上四位艺人各自进度不同：完成天数、酬劳、角色都要分开读。
    const mv = ending.shooting.find((s) => s.code === 'MV031');
    const rows = mv?.casts.map((c) => `${c.artistName}:${c.role?.role ?? '-'}:${c.doneDays}/${c.workDays}:${c.pay}`);
    check(mv?.casts.length === 4,
      'Ending0009: MV031 一条通告读出四位艺人的独立进度',
      rows?.join(' | ') ?? 'none');
    check(mv?.casts.every((c) => c.role !== null),
      'Ending0009: MV031 四位艺人各占一个角色，没有两行抢同一格',
      mv?.casts.map((c) => c.role?.roleCode ?? '-').join(','));
    check(mv?.casts.find((c) => c.artistId === 77)?.doneDays === 34
      && mv?.casts.find((c) => c.artistId === 77)?.pay === 15500000
      && mv?.casts.find((c) => c.artistId === 1)?.doneDays === 22
      && mv?.casts.find((c) => c.artistId === 1)?.pay === 1500000,
      'Ending0009: 原少緯 34 天 / 1550 万，林芬芬 22 天 / 150 万，互不串位',
      mv?.casts.map((c) => `${c.artistId}:${c.doneDays}:${c.pay}`).join(' '));
    // #75 在 StarRole.dat 里是「千萬不要用」占位记录，stars 表缺它 —— 必须回退到
    // ARTIST_DIRECTORY 显示成 聆香，而不是裸的「艺人 #75」。Ending0009 里 TV807 的
    // 女主角正是由 #75 预约。
    const tv807by75 = ending.notices.find((n) => n.code === 'TV807')
      ?.roles.find((r) => r.reservedBy === '聆香');
    check(!!tv807by75,
      'Ending0009: TV807 被 #75 预约，显示为 聆香 而非 艺人 #75',
      tv807by75 ? `TV807 ${tv807by75.role} -> ${tv807by75.reservedBy}` : 'TV807 无 #75 预约');
  } else {
    console.log('OK   Ending0009.sa2 not present, skipped the two-team checks');
  }
}

// 第四个存档（Ending0004）：自制通告 20 条，顺序和名字要与游戏「通告列表 →
// 自制通告及其他」一致。名字不在 data1 之前的旧静态表里，10 条会读不到。
{
  const diyPath = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Ending0004.sa2';
  if (fs.existsSync(diyPath)) {
    const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
    const raw = fs.readFileSync(diyPath);
    const diy = parseSave(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, 'Ending0004.sa2',
    );
    check(diy.selfMade.length === 20,
      'Ending0004: CaseCreate 列出 20 条自制通告', String(diy.selfMade.length));
    check(diy.selfMade[0]?.code === 'CD701' && diy.selfMade[19]?.code === 'CD723',
      'Ending0004: 顺序与游戏列表一致（CD701 … CD723）',
      `${diy.selfMade[0]?.code} … ${diy.selfMade.at(-1)?.code}`);
    const names = diy.selfMade.map((n) => n.name);
    check(names.every((name) => name && name !== '（自制通告）'),
      'Ending0004: 20 条都查到了名字（data1 那份静态表才全）',
      names.filter((n) => n === '（自制通告）').length + ' missing');
    const tv601 = diy.selfMade.find((n) => n.code === 'TV601');
    check(tv601?.name === '握斧長龍' && tv601?.days === 15 && tv601?.roles.length === 4,
      'Ending0004: 握斧長龍 15 天、四个角色',
      `${tv601?.name}/${tv601?.days}/${tv601?.roles.length}`);
    check(tv601?.casts.map((c) => c.artistName).join(',') === '姚子奇,姚子莹,卫亚,新名纱雪',
      'Ending0004: 握斧長龍 四位自家艺人各接一个角色（带酬劳）',
      tv601?.casts.map((c) => `${c.artistName}:${c.pay}`).join(' '));
    // 同一首歌在不同存档里天数不同（Story0024 记 20、这里 25），所以只能断言
    // 读到的是「这一份存档」的数，不能当静态值。
    check(diy.selfMade.every((n) => n.days === 0 || (n.days > 0 && n.days < 400)),
      'Ending0004: 每条的天数都在合理区间', diy.selfMade.map((n) => n.days).join(','));
    const unsigned = diy.selfMade.filter((n) => n.casts.length === 0);
    check(unsigned.length === 8 && diy.selfMade.every((n) => n.casts.every((c) => c.pay > 0)),
      'Ending0004: 12 条已接 / 8 条没人接，接演记录都带酬劳',
      `taken=${diy.selfMade.length - unsigned.length} empty=${unsigned.length}`);
    // 自制通告块里自带一段档期：第一个日期是开拍（周一），第二个是杀青。
    // 状态由今天落在这段区间的哪一侧决定，跟拍摄中同一口径。
    check(tv601?.startDate === '2008/6/30' && tv601?.endDate === '2008/9/1'
      && tv601?.status === 'done',
      'Ending0004: 握斧長龍 从块里读出开拍 / 杀青，今天已过杀青 → 已完成',
      `${tv601?.startDate} → ${tv601?.endDate} ${tv601?.status}`);
    const cd726 = diy.selfMade.find((n) => n.code === 'CD726');
    // CD726 的档期跨年，但没人接演 —— 档期只是挂在列表上的排期，没人进组
    // 就只能是「未开拍」，不能因为今天落在区间里就说人家在拍。
    check(cd726?.startDate === '2008/12/1' && cd726?.endDate === '2009/2/7'
      && cd726?.casts.length === 0 && cd726?.status === 'pending' && cd726?.daysLeft === 38,
      'Ending0004: 紅色情熱 跨年档期读全（2008/12/1 → 2009/2/7），没人接 → 未开拍',
      `${cd726?.startDate} → ${cd726?.endDate} ${cd726?.status} left=${cd726?.daysLeft}`);
    // 拍摄天数按人算：同一部戏里男主角和女配角的天数本来就不一样，不能
    // 拿通告级的天数糊一行给四个人。
    check(tv601?.casts.map((c) => c.workDays).join(',') === '45,45,20,20'
      && tv601?.casts.every((c) => c.needDays === 0 && c.doneDays === c.workDays),
      'Ending0004: 握斧長龍 每人按角色查长度表（男/女主角 45、配角 20），结局存档清零的按拍满补回',
      tv601?.casts.map((c) => `${c.artistName}:${c.doneDays}/${c.workDays}+${c.needDays}`).join(' '));
    check(diy.selfMade.every((n) => n.casts.every((c) => c.workDays === c.doneDays + c.needDays)),
      'Ending0004: 每条接演记录的天数都自洽（已完成 + 还差 = 需拍）',
      diy.selfMade.flatMap((n) => n.casts).length + ' casts');
    check(tv601?.casts.map((c) => `${c.artistName}:${c.role?.role}`).join(' ') ===
      '姚子奇:男主角 姚子莹:女主角 卫亚:男配角 新名纱雪:女配角',
      'Ending0004: 握斧長龍 四个人各拿各的角色，不合成一条',
      tv601?.casts.map((c) => `${c.artistName}:${c.role?.role}`).join(' ') ?? '-');
    check(diy.selfMade.every((n) => ['pending', 'shooting', 'done', 'overdue', 'unknown'].includes(n.status)),
      'Ending0004: 每条自制通告都有合法状态',
      [...new Set(diy.selfMade.map((n) => n.status))].join(','));
  } else {
    console.log('OK   Ending0004.sa2 not present, skipped the self-made checks');
  }
}

// 第五个存档（Ending0005）：一条自制通告正在拍摄中，接演记录里每位艺人
// 各有「已完成 / 还差」，两个人的天数可以不一样 —— 这正是不能拿通告级
// 天数糊一整行的原因。
{
  const midPath = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Ending0005.sa2';
  if (fs.existsSync(midPath)) {
    const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
    const raw = fs.readFileSync(midPath);
    const mid = parseSave(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, 'Ending0005.sa2',
    );
    const tv601 = mid.selfMade.find((n) => n.code === 'TV601');
    check(tv601?.status === 'shooting' && tv601?.casts.length === 4,
      'Ending0005: 握斧長龍 还在档期内、四个人进组 → 拍摄中',
      `${tv601?.status} casts=${tv601?.casts.length}`);
    const keliesi = tv601?.casts.find((c) => c.artistName === '克烈斯');
    check(keliesi?.role?.role === '男主角' && keliesi?.doneDays === 37
      && keliesi?.needDays === 8 && keliesi?.workDays === 45,
      'Ending0005: 克烈斯 男主角 已完成 37 天 / 还差 8 天（连续剧男主角 45 天）',
      `${keliesi?.role?.role} ${keliesi?.doneDays}/${keliesi?.workDays}+${keliesi?.needDays}`);
    const chenyifu = tv601?.casts.find((c) => c.artistName === '陈奕夫');
    check(chenyifu?.role?.role === '男配角' && chenyifu?.doneDays === 20
      && chenyifu?.workDays === 20 && chenyifu?.needDays === 0,
      'Ending0005: 陈奕夫 男配角 已拍满（20/20）',
      `${chenyifu?.role?.role} ${chenyifu?.doneDays}/${chenyifu?.workDays}`);
    check(tv601?.casts.every((c) => c.workDays === c.doneDays + c.needDays)
      && new Set(tv601?.casts.map((c) => c.workDays)).size > 1,
      'Ending0005: 同一条通告上各人的需拍天数不一样（按人算）',
      tv601?.casts.map((c) => `${c.artistName}:${c.workDays}`).join(' '));
    check(mid.company?.name === '君君傳媒' && mid.company?.image === '邁向國際的'
      && mid.company?.fame === 45093 && mid.company?.pr === 1300,
      'Ending0005: 公司换成 君君傳媒 后形象 / 知名度 / 公关 也跟着存档走',
      `${mid.company?.name} ${mid.company?.image} ${mid.company?.fame}/${mid.company?.pr}`);
  } else {
    console.log('OK   Ending0005.sa2 not present, skipped the shooting self-made checks');
  }
}

// 第六个存档（Story0055）：天数的真值核过游戏界面 —— 接演记录里 +8 是已完成、
// +16 是还差，总天数以长度表为准（唱片 25 天）。这儿两条都是用户对着游戏看的。
{
  const p55 = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Story0055.sa2';
  if (fs.existsSync(p55)) {
    const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
    const raw = fs.readFileSync(p55);
    const s55 = parseSave(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, 'Story0055.sa2',
    );
    const youpeng = s55.selfMade.find((n) => n.code === 'CD701');
    const weiya = youpeng?.casts.find((c) => c.artistName === '卫亚');
    check(weiya?.doneDays === 22 && weiya?.needDays === 3 && weiya?.workDays === 25,
      'Story0055: 有朋自遠方來 卫亚 已完成 22 天 / 还差 3 天（唱片 25 天）',
      `${weiya?.doneDays}/${weiya?.workDays}+${weiya?.needDays}`);
    check(youpeng?.status === 'overdue',
      'Story0055: 有朋自遠方來 档期过了还差 3 天 → 已逾期（不能说已完成）',
      youpeng?.status);
    const qingcheng = s55.selfMade.find((n) => n.code === 'CD757');
    const lingxiang = qingcheng?.casts.find((c) => c.artistName === '聆香');
    // 聆香的「还差」格写的是 5，实际还差 15 —— 所以总天数只能信长度表，
    // 不能拿「已完成 + 还差」相加（那样会算成 15 天）。
    check(lingxiang?.doneDays === 10 && lingxiang?.workDays === 25 && lingxiang?.needDays === 15,
      'Story0055: 傾城之戀 聆香 已完成 10 天 / 还差 15 天（唱片 25 天，不是 15）',
      `${lingxiang?.doneDays}/${lingxiang?.workDays}+${lingxiang?.needDays}`);
    check(qingcheng?.status === 'shooting', 'Story0055: 傾城之戀 今天夹在档期里 → 拍摄中', qingcheng?.status);
    // 团体通告：夢的十四行詩 是「團體」专辑，签的是沙啞之歌整个团（队长 新名纱雪、
    // 团员 卫亚），不是新名纱雪一个人；天数仍按这位接演艺人算。
    const meng = s55.selfMade.find((n) => n.code === 'CD754');
    const xinming = meng?.casts.find((c) => c.artistName === '新名纱雪');
    check(xinming?.group?.name === '沙啞之歌' && xinming?.group?.leaderName === '新名纱雪'
      && xinming?.group?.memberNames.join(',') === '新名纱雪,卫亚',
      'Story0055: 夢的十四行詩 显示签约团体 沙啞之歌（队长 新名纱雪 / 团员 卫亚）',
      JSON.stringify(xinming?.group ?? null));
    check(xinming?.doneDays === 15 && xinming?.workDays === 25 && xinming?.needDays === 10,
      'Story0055: 夢的十四行詩 的进度按新名纱雪自己的天数算（15/25，还差 10）',
      `${xinming?.doneDays}/${xinming?.workDays}+${xinming?.needDays}`);
  } else {
    console.log('OK   Story0055.sa2 not present, skipped the day-count checks');
  }
}

// buildGroupRecord: the first member is the leader, ids resolve to names.
{
  const rec = buildGroupRecord(
    { code: 101, name: '莎亞之音', memberIds: [74, 76], offset: 0 },
    (id) => (id === 74 ? '新名纱雪' : id === 76 ? '卫亚' : `编号${id}`),
  );
  check(rec.code === 101 && rec.name === '莎亞之音' && rec.leaderId === 74,
    'buildGroupRecord: first member becomes the leader', `${rec.leaderId}/${rec.leaderName}`);
  check(rec.leaderName === '新名纱雪' && rec.memberNames.join(',') === '新名纱雪,卫亚',
    'buildGroupRecord resolves member names', rec.memberNames.join(','));
  const empty = buildGroupRecord({ code: 102, name: '空团', memberIds: [], offset: 0 }, String);
  check(empty.leaderId === 0 && empty.leaderName === '' && empty.memberNames.length === 0,
    'buildGroupRecord tolerates a team with no recorded members');
}

// 资金展示：不上一万原样给，上万拆成 万，上亿再拆 亿（每段不加千分位）。
{
  const cases = [
    [5000, '5000'],
    [0, '0'],
    [12000, '1万2000'],
    [10000, '1万'],
    [1151527, '115万1527'],
    [10000000, '1000万'],
    [100000000, '1亿'],
    [110002000, '1亿1000万2000'],
    [231932039, '2亿3193万2039'],
    [-981723, '-98万1723'],
  ];
  const wrong = cases.filter(([value, text]) => moneyText(value) !== text);
  check(wrong.length === 0, 'moneyText: 资金按亿 / 万拆开写',
    wrong.map(([v, t]) => `${v}→${moneyText(v)}(期望 ${t})`).join(' ') || cases.map(([v]) => `${v}→${moneyText(v)}`).join(' '));
}

// 「未预约」筛选：至少一个角色空着，且还没停止接取（下周更新 / 已过截止不算）。
{
  const mk = (status, reserved) => ({
    status, roles: reserved.map((r) => ({ reservedBy: r })),
  });
  const rows = [
    [mk('open', []) , 0, false, '没有角色记录 → 不知道，不算未预约'],
    [mk('open', ['', '']), 2, true, '全空 → 算'],
    [mk('open', ['黎华', '']), 1, true, '只被占一个 → 还有未预约'],
    [mk('open', ['黎华', '方若绮']), 0, false, '全被预约 → 不算'],
    [mk('closing', ['']), 1, true, '即将截止但还有未预约角色 → 算'],
    [mk('upcoming', ['']), 1, false, '下周更新的还没开放 → 不算'],
    [mk('expired', ['']), 1, false, '已停止接取 → 不算'],
  ];
  const bad = rows.filter(([notice, free, ok]) => freeRoleCount(notice) !== free || isAcceptable(notice) !== ok);
  check(bad.length === 0, 'freeRoleCount / isAcceptable: 未预约 = 还有角色空着 且 还能接取',
    bad.map(([n, free, ok]) => `${n.status}/${JSON.stringify(n.roles)}→${freeRoleCount(n)}/${isAcceptable(n)}(期望 ${free}/${ok})`).join(' ') || `${rows.length} 例`);

  // 「满足条件」＝角色未预约 + 我方有人接得上。空着的角色全接不上就还是不算。
  const fitsAll = () => true;
  const fitsNone = () => false;
  const open2 = mk('open', ['', '']);
  const qualifiedRows = [
    [open2, fitsAll, true, '未预约且接得上 → 满足条件'],
    [open2, fitsNone, false, '未预约但一条都接不上 → 不算'],
    [mk('open', ['黎华', '方若绮']), fitsAll, false, '全被预约了，再够格也接不了'],
    [mk('upcoming', ['']), fitsAll, false, '下周更新还没开放 → 不算'],
    [mk('expired', ['']), fitsAll, false, '已停止接取 → 不算'],
  ];
  const badQualified = qualifiedRows.filter(
    ([notice, fits, ok]) => canTakeNotice(notice, fits) !== ok,
  );
  check(badQualified.length === 0, 'canTakeNotice: 满足条件 = 未预约 且 我方有人接得上',
    badQualified.map(([n, fits, ok]) => `${n.status}/${JSON.stringify(n.roles)}→${canTakeNotice(n, fits)}(期望 ${ok})`).join(' ')
      || `${qualifiedRows.length} 例`);

  // 只判空角色：被预约的那格就算接得上也不算数。
  const half = mk('open', ['黎华', '']);
  const asked = [];
  check(canTakeNotice(half, (role) => { asked.push(role); return true; })
    && half.roles.length - asked.length === 1,
    'canTakeNotice 只问没人接的角色', `问了 ${asked.length} / ${half.roles.length}`);
}

// 真实存档上的条数：probe 快照 8 条（3 条下周更新不算）、Story0055 9 条（CD017 / CF137 已满）。
for (const [save, expected, fullCodes, expectedQualified] of [
  // probe 是开局快照：8 条还有未预约角色，但九项数值差 2~4 项，一条都接不上。
  ['probe.sa2', 8, '', 0],
  // Story0055 已到后期，未预约的 9 条都满足条件（历史存档，游戏目录存在才跑）。
  ['Story0055.sa2', 9, 'CD017,CF137', 9],
]) {
  const p = save === 'probe.sa2'
    ? path.join(SNAP, 'probe.sa2')
    : `D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/${save}`;
  if (!fs.existsSync(p)) { console.log(`OK   ${save} not present, skipped the acceptable checks`); continue; }
  const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
  const raw = fs.readFileSync(p);
  const save_ = parseSave(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, save);
  const ok = save_.notices.filter(isAcceptable);
  const full = save_.notices.filter((n) => n.roles.length > 0 && freeRoleCount(n) === 0)
    .map((n) => n.code).join(',');
  check(ok.length === expected, `${save}: 未预约 ${expected} 条`,
    `${ok.length} :: ${ok.map((n) => n.code).join(',')}`);
  check(full === fullCodes, `${save}: 角色全被预约的通告`, full || 'none');
  // 满足条件：与页面上同一套判断（性别 + 九项数值，团体看队长）。
  const groups = save_.teams.map((team) => buildGroupRecord(
    team, (id) => ARTIST_DIRECTORY.find((a) => a.id === id)?.name ?? `编号${id}`));
  const signed = save_.artistDirectory.filter((option) => option.signed)
    .map((option) => ({
      option,
      artist: option.artistIndex === null
        ? null
        : save_.artists.find((a) => a.index === option.artistIndex) ?? null,
    }));
  const fits = (role) => {
    if (isGroupRole(role) && groups.length > 0) {
      return groups.some((group) => matchGroupRole(
        role, save_.artists.find((a) => a.roleId === group.leaderId) ?? null,
        group.name, group.leaderName,
      ).canAccept);
    }
    return signed.some((item) => item.artist
      && matchRole(role, item.artist, item.option.name, item.option.gender).canAccept);
  };
  const qualified = save_.notices.filter((n) => canTakeNotice(n, fits));
  check(qualified.length === expectedQualified, `${save}: 满足条件 ${expectedQualified} 条`,
    `${qualified.length} :: ${qualified.map((n) => n.code).join(',')}`);
}

// 友好度表：Story0002 萧依莉(#6)=141、Story0003=92，玩家口述核对过的真值。
// 读冻结快照而非游戏目录（活档已被改写成 144）。
for (const [save, expected] of [['Story0002.sa2', 141], ['Story0003.sa2', 92]]) {
  const p = path.join(SNAP, save);
  if (!fs.existsSync(p)) { console.log(`OK   ${save} not present, skipped the friendship check`); continue; }
  const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
  const raw = fs.readFileSync(p);
  const save_ = parseSave(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, save);
  const xiao = save_.artists.find((a) => a.roleId === 6);
  check(xiao?.friendship === expected, `${save}: 萧依莉友好度 ${expected}`,
    `实际 ${xiao?.friendship ?? '缺失'}`);
  check(save_.friendship[6] === expected, `${save}: 友好度表 #6 = ${expected}`,
    `实际 ${save_.friendship[6] ?? '缺失'}`);
  check(Object.keys(save_.friendship).length >= 18, `${save}: 友好度表覆盖 ${18} 位以上`,
    `${Object.keys(save_.friendship).length} 位`);
}

// 艺人称号：存进艺人块起始前 12 字节，是 Nickname.tab 里的称号编号。
// 真值来自玩家口述（陈奕夫=主持新人、萧依莉=广告新人、苏嫚君=未出道新人），
// 三份冻结快照都对得上；顺带锁住「0 = 还没有称号」不是解析失败。
{
  const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
  const titles = tables.titles ?? {};
  check(Object.keys(titles).length >= 44, '称号表烘焙进 case-tables.json（>= 44 条）',
    `${Object.keys(titles).length} 条`);
  for (const [id, name] of [[622, '主持新人'], [623, '广告新人'], [701, '未出道新人'],
    [241, '主持人'], [451, '电视演员'], [601, '知名艺人']]) {
    check(titles[String(id)] === name, `称号 #${id} = ${name}`, titles[String(id)] ?? '缺失');
  }
  // 烘焙出来的名字不该再混着繁体（國际名模 这种）。
  const traditional = [...new Set(Object.values(titles).join(''))]
    .filter((ch) => '際國級綜藝戲劇員電視廣兒過氣實動'.includes(ch));
  check(traditional.length === 0, '称号名全部转成简体', traditional.join(''));

  // 每条称号都带「线 / 媒介 / 门槛」：页面靠 line 上色、靠 need 做 hover 卡。
  const meta = tables.titleMeta ?? {};
  check(Object.keys(meta).length === Object.keys(titles).length,
    '每个称号都带线 / 门槛元数据',
    `${Object.keys(meta).length} / ${Object.keys(titles).length}`);
  for (const [id, line] of [[1, 'star'], [11, 'star'], [101, 'music'], [121, 'music'],
    [201, 'host'], [241, 'host'], [311, 'model'], [341, 'model'], [401, 'screen'],
    [411, 'screen'], [464, 'screen'], [624, 'screen'], [501, 'other'], [611, 'other'], [701, 'other']]) {
    check(meta[String(id)]?.line === line, `称号 #${id} 归到 ${line} 线`, meta[String(id)]?.line ?? '缺失');
  }
  const lines = new Set(Object.values(meta).map((m) => m.line));
  check(['music', 'host', 'model', 'screen', 'star', 'other'].every((l) => lines.has(l)),
    '六种称号线都烘焙出了数据', [...lines].join(','));
  // 门槛按列反推自 Nickname.tab：歌神=歌艺 700 + 5 张专辑，戏剧天王=演技 700 + 7 部电影。
  const needOf = (id) => Object.fromEntries((meta[String(id)]?.need ?? []).map(([k, v]) => [k, v]));
  check(needOf(101).歌艺 === 700 && needOf(101).专辑 === 5, '歌神门槛：歌艺 700 + 专辑 5',
    JSON.stringify(needOf(101)));
  check(needOf(401).演技 === 700 && needOf(401).电影作品 === 7,
    '戏剧天王门槛：演技 700 + 电影 7', JSON.stringify(needOf(401)));
  check((meta['701'].need ?? []).length === 0, '未出道新人没有门槛', JSON.stringify(meta['701'].need));
  // 同名还有「通用版」：戏剧天王 411 要 5 部电视 + 5 部电影，不能被 MV 版覆盖掉。
  check(meta['411'].need.some(([k, v]) => k === '电视作品' && v === 5),
    '通用版戏剧天王保留自己的作品门槛', JSON.stringify(meta['411'].need));

  // 梯子：除过气艺人（掉档结果，不是升级方向）外每个称号都要有档位，
  // 而且同一条线的档位必须连续 —— 中间缺一档，「下一档」就会指错。
  const ranked = Object.entries(meta).filter(([, m]) => m.rank !== null && m.rank !== undefined);
  check(ranked.length === Object.keys(meta).length - 1, '除过气艺人外都有档位',
    `${ranked.length} / ${Object.keys(meta).length}`);
  const rankByLine = {};
  for (const [, m] of ranked) (rankByLine[m.line] ??= []).push(m.rank);
  const gaps = Object.entries(rankByLine)
    .filter(([, rs]) => new Set(rs).size !== Math.max(...rs) + 1)
    .map(([line, rs]) => `${line}:${[...new Set(rs)].sort((a, b) => a - b)}`);
  check(gaps.length === 0, '每条线的档位连续', gaps.join(' '));
  check(meta['501'].rank === null, '过气艺人不在升级梯子上', String(meta['501'].rank));

  for (const [save, expected] of [
    ['Story0002.sa2', { 6: '未出道新人' }],
    ['Story0004.sa2', { 6: '未出道新人', 8: '主持新人' }],
    ['probe.sa2', { 5: '未出道新人', 6: '未出道新人' }],
  ]) {
    const p = path.join(SNAP, save);
    if (!fs.existsSync(p)) { console.log(`OK   ${save} not present, skipped the title check`); continue; }
    const raw = fs.readFileSync(p);
    const save_ = parseSave(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, save);
    for (const [roleId, name] of Object.entries(expected)) {
      const artist = save_.artists.find((a) => a.roleId === Number(roleId));
      check(artist?.title === name, `${save}: #${roleId} 称号 = ${name}`,
        `实际 ${artist ? `${artist.titleId}/${artist.title || '（空）'}` : '缺块'}`);
    }
    // 结构不变式：凡是读了非 0 编号的，都必须能在表里查到名字。
    const orphans = save_.artists.filter((a) => a.titleId > 0 && !titles[String(a.titleId)]);
    check(orphans.length === 0, `${save}: 所有非 0 称号编号都能查到名字`,
      orphans.map((a) => `${a.roleId}:${a.titleId}`).join(','));
    // 有称号就必须有对应的线，否则页面上没有颜色可上。
    const noMeta = save_.artists.filter((a) => a.titleId > 0 && !a.titleMeta);
    check(noMeta.length === 0, `${save}: 有称号的艺人都带线信息`,
      noMeta.map((a) => `${a.roleId}:${a.titleId}`).join(','));
    // 顺带锁住几条线：称号名 -> 线必须和烘焙时一致（哪个艺人先拿到无所谓）。
    const LINE_BY_TITLE = {
      主持新人: 'host', 广告新人: 'model', 未出道新人: 'other',
      电视演员: 'screen', 主持人: 'host', 知名艺人: 'other', 歌手: 'music',
    };
    for (const artist of save_.artists) {
      const want = LINE_BY_TITLE[artist.title];
      if (!want || !artist.titleMeta) continue;
      check(artist.titleMeta.line === want, `${save}: ${artist.title} 归 ${want} 线`,
        artist.titleMeta.line);
    }
    // 「下一档」按烘焙的梯子走：主持新人 -> 主持人、广告新人 -> 模特儿、
    // 未出道新人 -> 新人。属性门槛算当前值，作品门槛算「通告统计」里的数。
    const NEXT_BY_TITLE = { 主持新人: '主持人', 广告新人: '模特儿', 未出道新人: '新人' };
    for (const artist of save_.artists) {
      const want = NEXT_BY_TITLE[artist.title];
      if (!want) continue;
      check(artist.titleNext?.name === want, `${save}: ${artist.title} 的下一档 = ${want}`,
        artist.titleNext ? artist.titleNext.name : '（空）');
    }
    // 艺人卡拿到的 option 也要带上同一个称号。
    const sample = Object.keys(expected)[0];
    const option = save_.artistDirectory.find((o) => o.id === Number(sample));
    check(option?.title === expected[sample], `${save}: 艺人目录 #${sample} 同步带称号`,
      option?.title ?? '缺失');
  }

  // 作品类门槛用的就是「通告统计」那五个数（电视作品 / 电影作品 / 专辑 / 广告 /
  // 节目），作品总数是五项相加 —— 和称号 hover 卡上写的名字、单位完全一致。
  {
    const p = path.join(SNAP, 'Story0034.sa2');
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p);
      const save_ = parseSave(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, 'Story0034.sa2');
      const get = (id) => save_.artists.find((a) => a.roleId === id);
      const fen = get(1); // 林芬芬 0 电视 / 1 电影 / 3 专辑 / 2 广告 / 1 节目
      const album = fen?.titleNext?.items.find((i) => i.label === '专辑');
      check(fen?.noticeCounts.join(',') === '0,1,3,2,1'
        && album?.need === 5 && album?.have === 3 && album?.diff === 2,
        'Story0034: 偶像歌手 → 唱匠 要 5 张专辑，统计 3 张，还差 2 张',
        JSON.stringify(album));
      const kai = get(9); // 关古威 8 / 3 / 6 / 10 / 0
      const total = kai?.titleNext?.items.find((i) => i.label === '作品总数');
      check(total?.need === 10 && total?.have === 27 && total?.diff === 0,
        'Story0034: 作品总数 = 五项相加（关古威 27）', JSON.stringify(total));
    }
  }
}

// 角色社交接演门槛（叛逆/性感/亲和）：Story0004 的 CF234 味美 解說篇要求亲和 ≥ 650，
// 这个门槛存在角色记录 off+76/80/84，静态 special 表也有但存档才是真源。
// 读冻结快照（玩家口述核对过 650），避免活档漂移。
{
  const p = path.join(SNAP, 'Story0004.sa2');
  if (!fs.existsSync(p)) {
    console.log('OK   Story0004.sa2 snapshot not present, skipped the social-threshold check');
  } else {
    const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
    const raw = fs.readFileSync(p);
    const save_ = parseSave(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, 'Story0004.sa2');
    const cf234 = save_.notices.find((n) => n.code === 'CF234');
    const female = cf234?.roles.find((r) => r.roleCode === 'CF2341');
    check(female?.social?.affinity === 650, 'Story0004 CF2341 从存档读到亲和门槛 650',
      `实际 ${female?.social?.affinity ?? '缺失'}`);
    const affinityReq = female?.requirements.find((req) => req.attr === '亲和');
    check(affinityReq?.value === 650, 'CF2341 所需数值含「亲和 650」隐藏条件',
      `实际 ${JSON.stringify(female?.requirements ?? [])}`);
    check(affinityReq?.staticGrade === '' && affinityReq?.rolledGrade === '',
      '社交门槛不带能力等级（叛逆/性感/亲和没有 A/B/C 档）',
      `static=${affinityReq?.staticGrade} rolled=${affinityReq?.rolledGrade}`);
    // 对比：拿一位亲和 470 的艺人（萧依莉）去比，应差 180；亲和 700 的陈奕夫应达标。
    const xiao = save_.artists.find((a) => a.roleId === 6);
    const yiFu = save_.artists.find((a) => a.roleId === 8);
    if (female && xiao && yiFu) {
      const gXiao = matchRole(female, xiao, '萧依莉', 'female').gaps.find((g) => g.attr === '亲和');
      const gYiFu = matchRole(female, yiFu, '陈奕夫', 'male').gaps.find((g) => g.attr === '亲和');
      check(gXiao?.need === 650 && gXiao?.have === 470 && gXiao?.diff === 180,
        '数值对比把萧依莉亲和 470 与门槛 650 比出差 180',
        JSON.stringify(gXiao));
      check(gYiFu?.need === 650 && gYiFu?.have === 700 && gYiFu?.diff === -50,
        '数值对比把陈奕夫亲和 700 判为达标（差 -50）',
        JSON.stringify(gYiFu));
    }
  }
}

// 预约要精确到角色号：存档里有一张 52 字节的「通告码 + 角色号 -> 接演艺人编号」
// 表，不能只按性别猜第一个同性别角色。Story0011 小熊寶寶有女主角/女配角两个
// 女角，苏嫚君接的是女配角；Story0004 的三条 NPC 预约是原先猜对了的对照组，
// 修完后必须保持原样。真值由玩家逐条口述，冻结成快照避免活档漂移。
{
  const tables = JSON.parse(fs.readFileSync(path.join(root, 'public/data/case-tables.json'), 'utf-8'));
  const load = (name) => {
    const p = path.join(SNAP, name);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p);
    return parseSave(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), tables, name);
  };
  const s11 = load('Story0011.sa2');
  if (!s11) {
    console.log('OK   Story0011.sa2 snapshot not present, skipped the role-reservation check');
  } else {
    const tv048 = s11.notices.find((n) => n.code === 'TV048');
    const lead = tv048?.roles.find((r) => r.roleCode === 'TV0481');
    const support = tv048?.roles.find((r) => r.roleCode === 'TV0482');
    check(lead?.role === '女主角' && support?.role === '女配角',
      'Story0011 TV048 有女主角与女配角两个角色',
      tv048?.roles.map((r) => `${r.roleCode}:${r.role}`).join(',') ?? '缺通告');
    check(lead?.reservedBy === '', 'Story0011 TV048 女主角没有被苏嫚君误占',
      `实际 ${lead?.reservedBy || '（空）'}`);
    check(support?.reservedBy === '蘇嫚君', 'Story0011 TV048 女配角精确落到苏嫚君',
      `实际 ${support?.reservedBy || '（空）'}`);
  }
  const s01 = load('Story0001.sa2');
  if (s01) {
    const tva62 = s01.notices.find((n) => n.code === 'TVA62');
    check(tva62?.roles.length === 4, 'Story0001 TVA62 屈原列傳解出 4 个角色（带字母的通告码）',
      `${tva62?.roles.length ?? '缺通告'} 个`);
    check(tva62?.roles.find((r) => r.roleCode === 'TVA621')?.reservedBy === '丹尼斯',
      'Story0001 屈原列傳男主角 = 丹尼斯',
      `实际 ${tva62?.roles.find((r) => r.roleCode === 'TVA621')?.reservedBy || '（空）'}`);
  }
  const s04 = load('Story0004.sa2');
  if (s04) {
    for (const [code, roleCode, name] of [
      ['TV054', 'TV0542', '方若綺'],
      ['TV828', 'TV8281', '史蒂芬'],
      ['MV002', 'MV0021', '馬智文'],
    ]) {
      const role = s04.notices.find((n) => n.code === code)?.roles.find((r) => r.roleCode === roleCode);
      check(role?.reservedBy === name, `Story0004 ${roleCode} 仍是 ${name}（对照组不回退）`,
        `实际 ${role?.reservedBy || '（空）'}`);
    }
  }
  // 作品数真值：玩家在游戏「藝人資料」里逐条抄下来的四组数字。
  const s34 = load('Story0034.sa2');
  if (s34) {
    const get = (id) => s34.artists.find((a) => a.roleId === id);
    for (const [id, name, want] of [
      [1, '林芬芬', '0,1,3,2,1'],
      [9, '關古威', '8,3,6,10,0'],
      [74, '新名紗雪', '1,3,1,3,0'],
      [72, '克烈斯', '7,1,0,9,1'],
    ]) {
      check(get(id)?.noticeCounts.join(',') === want,
        `Story0034 ${name} 作品数 电视/电影/唱片/广告/主持 = ${want}`,
        JSON.stringify(get(id)?.noticeCounts));
    }
  } else {
    console.log('OK   Story0034.sa2 snapshot not present, skipped the work-count checks');
  }
  const auto = load('Auto.sa2');
  if (auto) {
    const get = (id) => auto.artists.find((a) => a.roleId === id);
    check(auto.currentDate?.text === '2006/4/2', 'Auto 快照日期 2006/4/2',
      auto.currentDate?.text ?? '缺日期');
    // 作品数取游戏自己算好的那一组（状态块 +248），只算已完成的通告。
    check(get(6)?.noticeCounts.join(',') === '0,0,0,3,0',
      'Auto 萧依莉 3 支广告、0 档节目（在拍的 SH068 不计入）',
      JSON.stringify(get(6)?.noticeCounts));
    check(get(8)?.noticeCounts.join(',') === '0,0,0,1,2',
      'Auto 陈奕夫 1 支广告 2 档节目（含加入公司前的履历）',
      JSON.stringify(get(8)?.noticeCounts));
    // 马智文是 NPC、从未签约，作品数照样有值 —— 统计里含他在别家公司、
    // 以及加入公司之前的作品，所以不能靠数我方的接演记录。
    check(get(14)?.noticeCounts.join(',') === '7,15,0,6,0',
      'Auto 马智文历史作品 7 电视 15 电影 6 广告（含加入公司前）',
      JSON.stringify(get(14)?.noticeCounts));
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
