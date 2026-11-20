/** 作品明细与六大通告助手共用的角色胶囊配色：
 *  主角 / 外景主持 / 主持人用品牌粉提亮，配角与助理主持压成灰底。 */
export function workRoleClass(role: string): string {
  const featured = role.includes('主角') || role === '外景主持' || role === '主持人';
  return featured
    ? 'rounded bg-brand-soft px-1 font-semibold text-brand-strong'
    : 'rounded bg-line px-1 text-ink-muted';
}
