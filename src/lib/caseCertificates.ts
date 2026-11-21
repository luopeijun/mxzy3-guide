import type { CaseTables, OwnedItem } from './caseParser';
import { CERT_REQUIREMENTS } from './specials';

/** 证书取得条件来自 sources/certificates.txt：学院课程 + 属性门槛。 */
export interface CertificateGuide {
  /** 存档/条件表里的短名，如「戏剧证书」。 */
  cert: string;
  /** 属性门槛在攻略里用的名字，如「表演证书」。 */
  title: string;
  academy: string;
  courses: string[];
  attrs: { name: string; min: number }[];
}

const CERT_GUIDE_SOURCE: Array<Omit<CertificateGuide, 'attrs'>> = [
  {
    cert: '音乐证书',
    title: '音乐证书',
    academy: '音乐学院（维也纳）',
    courses: ['音感发生（专业）', '乐器乐理（专业）', '快速记忆（高级）', '美姿美仪（高级）'],
  },
  {
    cert: '舞蹈证书',
    title: '舞蹈证书',
    academy: '舞蹈学院（夏威夷）',
    courses: ['有氧舞蹈（专业）', '舞台表演（专业）', '摄影训练（高级）'],
  },
  {
    cert: '戏剧证书',
    title: '表演证书',
    academy: '戏剧学院（纽约）',
    courses: ['声音表情（专业）', '肢体语言（专业）', '说话技巧（高级）'],
  },
];

export const CERTIFICATE_GUIDES: CertificateGuide[] = CERT_GUIDE_SOURCE.map((guide) => ({
  ...guide,
  attrs: CERT_REQUIREMENTS.find((row) => row.cert === guide.cert)?.attrs ?? [],
}));

/** 条件表可能写「国际戏剧学院证书」这类全名，按关键字认回三类证书。 */
export function certificateGuide(name: string): CertificateGuide | undefined {
  const cert = ['戏剧', '音乐', '舞蹈'].find((keyword) => name.includes(keyword));
  const shortName = cert ? `${cert}证书` : '';
  return CERTIFICATE_GUIDES.find((guide) => guide.cert === shortName);
}

const CERT_KINDS = [
  { word: '舞蹈', label: '舞蹈' },
  { word: '戲劇', label: '戏剧' },
  { word: '音樂', label: '音乐' },
] as const;

/** 特殊物品里的学院结业证书按道具说明开头挂到艺人身上。
 *  「藝人的…」是通用道具，没有名字前缀，不能算给任何一位艺人。 */
export function artistCertificates(items: OwnedItem[], tables: CaseTables): Map<number, string[]> {
  const byId = new Map<number, string[]>();
  const nameToId: Array<[string, number]> = Object.entries(tables.stars ?? {})
    .filter(([, info]) => !!info?.[0])
    .map(([id, info]) => [info[0], Number(id)] as [string, number])
    .sort((a, b) => b[0].length - a[0].length);
  for (const item of items) {
    if (item.quantity <= 0) continue;
    const name = item.name ?? '';
    if (!name.includes('證書')) continue;
    const kind = CERT_KINDS.find((entry) => name.includes(entry.word));
    if (!kind) continue;
    const owner = nameToId.find(([star]) => item.desc?.startsWith(star));
    if (!owner) continue;
    const list = byId.get(owner[1]) ?? [];
    if (!list.includes(kind.label)) list.push(kind.label);
    byId.set(owner[1], list);
  }
  for (const list of byId.values()) {
    list.sort((a, b) => CERT_KINDS.findIndex((entry) => entry.label === a)
      - CERT_KINDS.findIndex((entry) => entry.label === b));
  }
  return byId;
}
