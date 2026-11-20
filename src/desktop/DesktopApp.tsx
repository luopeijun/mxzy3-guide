import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CaseReaderApp, { type ExternalSave } from '../components/case/CaseReaderApp';
import { GuideDataContext } from '../hooks/useGuideContext';
import { useGuideData } from '../hooks/useGuideData';
import { cn } from '../lib/cn';

interface SaveFile {
  name: string;
  path: string;
  mtime: number;
  size: number;
}

interface DesktopState {
  saveDir: string;
  autoFollow: boolean;
  selectedName: string;
  saves: SaveFile[];
}

interface DesktopBridge {
  getState(): Promise<DesktopState>;
  chooseDir(): Promise<DesktopState | null>;
  refresh(): Promise<DesktopState>;
  setAutoFollow(enabled: boolean): Promise<boolean>;
  setSelected(name: string): Promise<string>;
  readSave(filePath: string): Promise<ArrayBuffer>;
  openSave(pickedPath?: string): Promise<boolean>;
  requestReload(): Promise<boolean>;
  onOpenSave(callback: (save: { name: string; path: string; buffer: ArrayBuffer }) => void): () => void;
  onReloadRequest(callback: () => void): () => void;
  onState(callback: (state: DesktopState) => void): () => void;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

const EMPTY_STATE: DesktopState = { saveDir: '', autoFollow: false, selectedName: '', saves: [] };

function formatTime(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 桌面端顶栏：目录由用户自己导入，存档位可挑，点一下读当前态，可开自动跟随。
 *  高度 64px，正好接上 CaseReaderApp 的 `fixed top-16`。 */
export default function DesktopApp() {
  // 场景解锁提示读「场景开启方法」页；桌面端也要有同一份 GuideDataContext。
  const { data: guide } = useGuideData();
  const [state, setState] = useState<DesktopState>(EMPTY_STATE);
  const [externalSave, setExternalSave] = useState<ExternalSave | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [lastRead, setLastRead] = useState('');
  const tokenRef = useRef(0);
  const autoFollowRef = useRef(false);
  autoFollowRef.current = state.autoFollow;

  const applyState = useCallback((next: DesktopState) => {
    setState(next);
  }, []);

  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!bridge) {
      setError('桌面文件桥未就绪，请重新启动桌面版。');
      return;
    }
    void bridge.getState().then(applyState).catch((reason: unknown) => {
      setError(String(reason));
    });
    const off = bridge.onState((next) => applyState(next));
    return () => { off(); };
  }, [applyState]);

  /** 自动跟随时目录有变化就重读当前存档位；没选具体档位就读最近改动那份。 */
  const activeSave = useMemo(() => {
    if (!state.saves.length) return null;
    return state.saves.find((save) => save.name === state.selectedName) ?? state.saves[0];
  }, [state.saves, state.selectedName]);

  /** File 菜单打开的外部文件：重新载入时要重读它，而不是目录里的存档位。
   *  只要用户改从目录选档/自动跟随，就清掉，避免新旧两个来源打架。 */
  const openFileRef = useRef<{ path: string; name: string } | null>(null);

  const feedSave = useCallback((buffer: ArrayBuffer, name: string, source: string) => {
    tokenRef.current += 1;
    setExternalSave({ buffer, name, token: tokenRef.current });
    setLastRead(formatTime(Date.now()));
    setNotice(`${source} · ${name}`);
  }, []);

  const readSave = useCallback(async (target: SaveFile | null, source: string) => {
    const bridge = window.desktopBridge;
    if (!bridge || !target) {
      setNotice(target ? '' : '目录里还没有 .sa2 存档');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const buffer = await bridge.readSave(target.path);
      feedSave(buffer, target.name, source);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [feedSave]);

  // CDP 回归从外部喂一份快照，走和点读取按钮相同的状态通道。
  useEffect(() => {
    (window as unknown as { __desktopFeedSave?: (b: ArrayBuffer, n: string) => void }).__desktopFeedSave =
      (buffer, name) => feedSave(buffer, name, '回归测试');
    return () => {
      delete (window as unknown as { __desktopFeedSave?: unknown }).__desktopFeedSave;
    };
  }, [feedSave]);

  // 主动读取时记下文件指纹；effect 只负责“自动跟随开着、且磁盘上的档位被
  // 游戏改写”这一种情况，避免读到新快照后反过来再触发一次，死循环。
  const lastSlotKeyRef = useRef('');
  const slotKey = (save: SaveFile) => `${save.path}|${save.mtime}|${save.size}`;
  const doRead = useCallback(async (target: SaveFile | null, source: string) => {
    openFileRef.current = null;
    if (target) lastSlotKeyRef.current = slotKey(target);
    await readSave(target, source);
  }, [readSave]);

  /** File → 重新载入：上次是菜单打开的文件就重读那个路径，否则读目录里的档位。 */
  const reloadExternal = useCallback(async (target: { path: string; name: string }) => {
    const bridge = window.desktopBridge;
    if (!bridge) return;
    setBusy(true);
    setError('');
    try {
      const buffer = await bridge.readSave(target.path);
      feedSave(buffer, target.name, '已重新载入文件');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [feedSave]);

  const doReadRef = useRef(doRead);
  doReadRef.current = doRead;
  const activeSaveRef = useRef(activeSave);
  activeSaveRef.current = activeSave;

  // 原生菜单由主进程触发，结果从桥推回来；这里只订阅，不开第二条解析路径。
  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!bridge || typeof bridge.onOpenSave !== 'function' || typeof bridge.onReloadRequest !== 'function') return;
    const offOpen = bridge.onOpenSave((save) => {
      openFileRef.current = { path: save.path, name: save.name };
      feedSave(save.buffer, save.name, '已从文件打开');
    });
    const offReload = bridge.onReloadRequest(() => {
      const external = openFileRef.current;
      if (external) { void reloadExternal(external); return; }
      const target = activeSaveRef.current;
      if (!target) {
        setNotice('当前没有可重新载入的存档，请用 File → 打开存档…');
        return;
      }
      void doReadRef.current(target, '已重新载入当前存档');
    });
    return () => { offOpen(); offReload(); };
  }, [feedSave, reloadExternal]);

  useEffect(() => {
    if (!activeSave || !autoFollowRef.current) return;
    const key = slotKey(activeSave);
    if (lastSlotKeyRef.current === key) return;
    lastSlotKeyRef.current = key;
    void readSave(activeSave, '自动跟随已更新');
  }, [activeSave, readSave]);

  const onChooseDir = useCallback(async () => {
    const bridge = window.desktopBridge;
    if (!bridge) return;
    setError('');
    try {
      const next = await bridge.chooseDir();
      if (next) {
        applyState(next);
        setNotice(`已选择目录：${next.saveDir}`);
        const pick = next.saves.find((save) => save.name === next.selectedName) ?? next.saves[0];
        if (pick) void doRead(pick, '已读取当前存档');
        else {
          openFileRef.current = null;
          setNotice(`已选择目录：${next.saveDir}，但里面没有 .sa2 存档`);
        }
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [applyState, doRead]);

  const onSelectSlot = useCallback(async (name: string) => {
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const nextName = name === '__latest__' ? '' : name;
    await bridge.setSelected(nextName);
    setState((previous) => ({ ...previous, selectedName: nextName }));
    const pick = state.saves.find((save) => save.name === nextName) ?? state.saves[0];
    if (pick) void doRead(pick, '已切换存档位');
  }, [state.saves, doRead]);

  const onToggleFollow = useCallback(async () => {
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const next = !state.autoFollow;
    await bridge.setAutoFollow(next);
    if (next) openFileRef.current = null;
    setState((previous) => ({ ...previous, autoFollow: next }));
    setNotice(next ? '自动跟随已开启：游戏一存档就刷新' : '自动跟随已关闭');
    if (next && activeSave) void doRead(activeSave, '自动跟随已开启');
  }, [state.autoFollow, activeSave, doRead]);

  return (
    <GuideDataContext.Provider value={guide}>
      <header
        data-desktop-bar
        className="fixed inset-x-0 top-0 z-[60] flex h-16 items-center gap-2 border-b border-line bg-surface px-4 shadow-sm"
      >
        <span className="shrink-0 text-ui-sm font-semibold text-brand-strong">明星志愿3 · 存档解析</span>
        <span className="h-5 w-px shrink-0 bg-line" />
        <button
          type="button"
          onClick={() => void onChooseDir()}
          className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-ui-2xs font-semibold text-white transition-colors hover:bg-brand-strong"
        >
          选择存档目录
        </button>
        <span
          className={cn('max-w-[220px] truncate text-ui-2xs', state.saveDir ? 'text-ink-muted' : 'text-alert')}
          title={state.saveDir}
        >
          {state.saveDir || '尚未选择 Save2 目录'}
        </span>
        <select
          aria-label="存档位"
          data-desktop-slot
          value={state.selectedName || '__latest__'}
          onChange={(event) => void onSelectSlot(event.target.value)}
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
          disabled={!activeSave || busy}
          onClick={() => void doRead(activeSave, '已读取当前存档')}
          className="shrink-0 rounded-full border border-brand-line bg-brand-soft px-3 py-1.5 text-ui-2xs font-semibold text-brand-strong transition-colors hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? '读取中…' : '读取当前游戏状态'}
        </button>
        <button
          type="button"
          data-desktop-follow
          aria-pressed={state.autoFollow}
          onClick={() => void onToggleFollow()}
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
              {notice || (activeSave ? `当前档位 ${activeSave.name} · ${formatTime(activeSave.mtime)}` : '选一个 Save2 目录开始')}
            </span>
          )}
          {lastRead && <span className="text-ui-2xs text-ink-faint">读取于 {lastRead}</span>}
        </span>
      </header>
      <CaseReaderApp externalSave={externalSave} />
    </GuideDataContext.Provider>
  );
}
