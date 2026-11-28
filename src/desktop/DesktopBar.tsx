import { cn } from '../lib/cn';
import { SITE_LABEL, type DesktopState, type Site } from './types';

interface DesktopBarProps {
  site: Site;
  state: DesktopState;
  busy: boolean;
  notice: string;
  error: string;
  lastRead: string;
  onChooseDir(): void;
  onSelectSlot(name: string): void;
  onRead(): void;
  onToggleFollow(): void;
  onNavigate(target: 'case' | 'sweet' | 'home'): void;
}

function formatTime(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 两个游戏的解析页共用同一条顶栏：目录各记各的，文案按游戏切换。
 *  高度 64px，正好接上 CaseReaderApp / SweetCaseView 的 `fixed top-16`。 */
export default function DesktopBar({
  site, state, busy, notice, error, lastRead,
  onChooseDir, onSelectSlot, onRead, onToggleFollow, onNavigate,
}: DesktopBarProps) {
  const emptyDir = site === 'main' ? '尚未选择 Save2 目录' : '尚未选择 Save 目录';
  const emptyHint = site === 'main' ? '选一个 Save2 目录开始' : '选一个 Save 目录开始';
  const active = state.saves.find((save) => save.name === state.selectedName) ?? state.saves[0] ?? null;

  return (
    <header
      data-desktop-bar
      className="fixed inset-x-0 top-0 z-[60] flex h-16 items-center gap-2 border-b border-line bg-surface px-4 shadow-sm"
    >
      <label className="flex shrink-0 items-center gap-1.5 text-ui-2xs text-ink-muted">
        <span>切换游戏</span>
        <select
          data-desktop-site-switch
          value={site === 'main' ? 'case' : 'sweet'}
          onChange={(event) => onNavigate(event.target.value as 'case' | 'sweet' | 'home')}
          className="rounded-ui-sm border border-line bg-surface px-2 py-1 text-ui-2xs text-ink"
        >
          <option value="case">明星志愿3</option>
          <option value="sweet">甜蜜乐章</option>
          <option value="home">返回选择页</option>
        </select>
      </label>
      <span className="shrink-0 text-ui-sm font-semibold text-brand-strong">{SITE_LABEL[site]} · 存档解析</span>
      <span className="h-5 w-px shrink-0 bg-line" />
      <button
        type="button"
        data-desktop-choose-dir
        onClick={onChooseDir}
        className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-ui-2xs font-semibold text-white transition-colors hover:bg-brand-strong"
      >
        选择存档目录
      </button>
      <span
        className={cn('max-w-[220px] truncate text-ui-2xs', state.saveDir ? 'text-ink-muted' : 'text-alert')}
        title={state.saveDir}
      >
        {state.saveDir || emptyDir}
      </span>
      <select
        aria-label="存档位"
        data-desktop-slot
        value={state.selectedName || '__latest__'}
        onChange={(event) => onSelectSlot(event.target.value)}
        className="max-w-[200px] shrink-0 rounded-ui-sm border border-line bg-surface px-2 py-1.5 text-ui-2xs text-ink"
      >
        <option value="__latest__">最近改动（默认）</option>
        {state.saves.map((save) => (
          <option key={save.name} value={save.name}>{save.name}</option>
        ))}
      </select>
      <button
        type="button"
        data-desktop-read
        disabled={!active || busy}
        onClick={onRead}
        className="shrink-0 rounded-full border border-brand-line bg-brand-soft px-3 py-1.5 text-ui-2xs font-semibold text-brand-strong transition-colors hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? '读取中…' : '读取当前游戏状态'}
      </button>
      <button
        type="button"
        data-desktop-follow
        aria-pressed={state.autoFollow}
        onClick={onToggleFollow}
        className={cn(
          'shrink-0 rounded-full border px-3 py-1.5 text-ui-2xs font-semibold transition-colors',
          state.autoFollow
            ? 'border-brand bg-brand text-white'
            : 'border-line text-ink-muted hover:border-brand-line hover:text-brand-strong',
        )}
      >
        {state.autoFollow ? '自动跟随 · 开' : '自动跟随 · 关'}
      </button>
      <span className="ml-auto flex min-w-0 flex-col items-end leading-tight">
        {error ? (
          <span data-desktop-error className="truncate text-ui-2xs text-alert">{error}</span>
        ) : (
          <span data-desktop-notice className="max-w-[320px] truncate text-ui-2xs text-ink-faint" title={notice}>
            {notice || (active ? `当前档位 ${active.name} · ${formatTime(active.mtime)}` : emptyHint)}
          </span>
        )}
        {lastRead && <span className="text-ui-2xs text-ink-faint">读取于 {lastRead}</span>}
      </span>
    </header>
  );
}
