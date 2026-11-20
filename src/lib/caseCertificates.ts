import type { CaseTables, OwnedItem } from './caseParser';

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
