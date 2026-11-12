import type { OriginTone } from './tracker';
import type { GroupKey } from './trackerGroups';

/** Per-site tracker wiring. The event-tracker components are shared between
 *  明星志愿3 and 甜蜜乐章; everything site-specific — storage keys, roster cap,
 *  artist-page prefix, group chips, copy text, archive format — lives here so
 *  the shared code stays free of `if (site === ...)` branches.
 *
 *  MAIN_TRACKER_CONFIG is the default: every lib function and the provider
 *  fall back to it, so the original site's behaviour is byte-for-byte what it
 *  was before the config layer existed. */
export interface TrackerSiteConfig {
  /** localStorage key of the tracker save (`*.backup.v1` is derived but kept
   *  explicit so the two keys can never drift apart). */
  storageKey: string;
  backupKey: string;
  /** Free-form memo list key (independent of progress by design). */
  memoKey: string;
  /** Roster cap: 明星志愿3 lets you sign 4 artists, 甜蜜乐章 only 3 — the
   *  protagonist is one of them, being both the agent and an artist. */
  maxArtists: number;
  /** Node-id prefix that marks an artist page (drives TaskLine.kind). */
  artistPrefix: string;
  /** Category id whose leaf nodes are the setup picker's artists. */
  artistCategoryId: string;
  /** Chip text per top-level category id, for the pool's origin chips. */
  categoryMeta: Record<string, { label: string; full: string; tone: OriginTone }>;
  /** Non-artist node-id prefix that maps to the `broker` group; everything
   *  else non-artist lands in `other`. */
  brokerPrefix: string;
  /** Group chips, in display order (empty groups still render a chip). */
  groups: { key: GroupKey; label: string; short: string }[];
  /** Columns of the batch panel's chip grid. */
  chipCols: number;
  /** Prefix of sign-off-dependent branch nodes whose lines stay in the pool
   *  once progress was recorded (明星志愿3: 路欧桑). Sites without such
   *  branches leave this unset — the retention logic never fires. */
  branchPrefix?: string;
  /** 章节 / 章名级别的挡线规则：攻略页照常可读，但这条线不进池。
   *  明星志愿3 用它挡掉角色页里与路欧桑分支页重复的感情线；甜蜜乐章没有
   *  重复内容，留空。 */
  poolSkip: Record<string, { sections?: string[]; headings?: string[] }>;
  /** A locked artist who is always under contract. 甜蜜乐章's protagonist is
   *  played by the user: agent and artist at once, not releasable. */
  protagonist?: { id: string; title: string; avatar?: string; hint: string };
  /** Copy under the expanded artist picker. */
  setupIntro: string;
  /** Tooltip of the overview's 「包含已解约」 switch. */
  includeReleasedTip: string;
  /** Archive envelope format + exported file-name prefix. Different per site
   *  so a 明星志愿3 save can never be imported into 甜蜜乐章 (or vice versa). */
  archiveFormat: string;
  archiveFilePrefix: string;
  /** 明星志愿3 exports one unified save (progress + CG collection + specials
   *  board); 甜蜜乐章 has neither of the latter, so it uses a tracker-only
   *  envelope and leaves those sections out of the panel entirely. */
  unifiedSave: boolean;
}

export const MAIN_TRACKER_CONFIG: TrackerSiteConfig = {
  storageKey: 'guide.progress.v1',
  backupKey: 'guide.progress.backup.v1',
  memoKey: 'guide.memo.v1',
  maxArtists: 4,
  artistPrefix: 'characters/',
  artistCategoryId: 'characters',
  categoryMeta: {
    'game-guide': { label: '经纪人', full: '经纪人事件簿', tone: 'broker' },
    characters: { label: '艺人', full: '艺人事件簿', tone: 'artist' },
    notices: { label: '通告', full: '六大特殊通告', tone: 'notice' },
    'other-events': { label: '其他', full: '其他事件', tone: 'other' },
  },
  brokerPrefix: 'game-guide/',
  groups: [
    { key: 'broker', label: '经纪人事件簿', short: '经纪人' },
    { key: 'artist', label: '艺人事件簿', short: '艺人' },
    { key: 'luousang', label: '路欧桑剧情', short: '路欧桑' },
    { key: 'other', label: '其他事件', short: '其他' },
  ],
  chipCols: 3,
  branchPrefix: 'other-events/luousang/',
  poolSkip: {
    // 路风的「事件」整节就是路桑恋 / 路欧恋分支。
    'characters/lu-feng': { sections: ['事件'] },
    // 桑禾蓓同理；「与主角的感情」不在此列，照常进池。
    'characters/sang-hebei': { sections: ['事件'] },
    // 欧怡青只去掉「路欧恋」一章，纪翔 / 告别 / 黎华那几章照常。
    'characters/ou-yiqing': { headings: ['路欧恋'] },
  },
  setupIntro:
    '旗下最多 4 位；解约的艺人仍会留在追踪名单里，任务线与已勾选的进度都保留。路欧桑剧情只按当前旗下组合挑选分支。点按钮＝加入 / 移出追踪，点右上角角标＝解约 / 复签。',
  includeReleasedTip: '已解约艺人与旧路欧桑分支的线仍在事件池里，只是默认不计入完成度',
  archiveFormat: 'stardom3-tracker-save',
  archiveFilePrefix: 'MXZY3',
  unifiedSave: true,
};

export const SWEET_TRACKER_CONFIG: TrackerSiteConfig = {
  storageKey: 'sweet.progress.v1',
  backupKey: 'sweet.progress.backup.v1',
  memoKey: 'sweet.memo.v1',
  // 主角既当经纪人又当艺人，恒占一个签约位：最多再签 2 人。
  maxArtists: 3,
  artistPrefix: 'sweet-characters/',
  artistCategoryId: 'sweet-characters',
  categoryMeta: {
    'sweet-guide': { label: '经纪人', full: '经纪人事件簿', tone: 'broker' },
    'sweet-characters': { label: '艺人', full: '角色攻略', tone: 'artist' },
    'sweet-side': { label: '支线', full: '支线攻略', tone: 'other' },
  },
  brokerPrefix: 'sweet-guide/',
  groups: [
    { key: 'broker', label: '经纪人事件簿', short: '经纪人' },
    { key: 'artist', label: '角色攻略', short: '艺人' },
    { key: 'other', label: '支线攻略', short: '支线' },
  ],
  chipCols: 2,
  poolSkip: {},
  protagonist: {
    id: 'protagonist',
    // 主角是杜云芊（红发双马尾），头像取自 甜蜜乐章/2/620-1.bmp。
    // 别再拿卫亚的头像：两人长得完全不像，之前复制错过一次。
    title: '杜云芊',
    avatar: 'images/sweet/protagonist-logo.png',
    hint: '杜云芊（主角）就是我们自己——既扮演经纪人也是旗下艺人，本周目固定在签约名单里，不能解约。',
  },
  setupIntro:
    '旗下最多 3 位，主角杜云芊固定占一位（我们既当经纪人也是艺人）；解约的艺人仍会留在追踪名单里，任务线与已勾选的进度都保留。点按钮＝加入 / 移出追踪，点右上角角标＝解约 / 复签。',
  includeReleasedTip: '已解约艺人的线仍在事件池里，只是默认不计入完成度',
  archiveFormat: 'sweet-tracker-save',
  archiveFilePrefix: '甜蜜乐章',
  unifiedSave: false,
};
