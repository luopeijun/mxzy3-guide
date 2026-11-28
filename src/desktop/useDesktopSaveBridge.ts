import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_STATE, SAVE_EXTENSION, type DesktopState, type ExternalSave, type Site } from './types';

function formatTime(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Slot = { path: string; name: string; mtime: number; size: number };

/** 两个解析页共用的桌面桥逻辑：目录、档位、自动跟随、File 菜单都按 site 分开。 */
export default function useDesktopSaveBridge(site: Site) {
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
    void bridge.setSite(site).catch(() => undefined);
    void bridge.getState(site).then(applyState).catch((reason: unknown) => {
      setError(String(reason));
    });
    const off = bridge.onState((next) => {
      if (next.site === site) applyState(next);
    });
    return () => { off(); };
  }, [applyState, site]);

  const activeSave = useMemo(() => {
    if (!state.saves.length) return null;
    return state.saves.find((save) => save.name === state.selectedName) ?? state.saves[0];
  }, [state.saves, state.selectedName]);

  /** File 菜单打开的外部文件：重新载入时重读它，而不是目录里的存档位。 */
  const openFileRef = useRef<{ path: string; name: string } | null>(null);

  const feedSave = useCallback((buffer: ArrayBuffer, name: string, source: string) => {
    tokenRef.current += 1;
    setExternalSave({ buffer, name, token: tokenRef.current });
    setLastRead(formatTime(Date.now()));
    setNotice(`${source} · ${name}`);
  }, []);

  const readSave = useCallback(async (target: Slot | null, source: string) => {
    const bridge = window.desktopBridge;
    if (!bridge || !target) {
      setNotice(target ? '' : `目录里还没有 ${SAVE_EXTENSION[site].hint}`);
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
  }, [feedSave, site]);

  // CDP 回归从外部喂一份快照，走和点读取按钮相同的状态通道。
  useEffect(() => {
    (window as unknown as { __desktopFeedSave?: (b: ArrayBuffer, n: string) => void }).__desktopFeedSave =
      (buffer, name) => feedSave(buffer, name, '回归测试');
    return () => {
      delete (window as unknown as { __desktopFeedSave?: unknown }).__desktopFeedSave;
    };
  }, [feedSave]);

  // 主动读取时记下文件指纹；自动跟随只在磁盘档位被游戏改写时触发，避免回环。
  const lastSlotKeyRef = useRef('');
  const slotKey = (save: Slot) => `${save.path}|${save.mtime}|${save.size}`;
  const doRead = useCallback(async (target: Slot | null, source: string) => {
    openFileRef.current = null;
    if (target) lastSlotKeyRef.current = slotKey(target);
    await readSave(target, source);
  }, [readSave]);

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
      const next = await bridge.chooseDir(site);
      if (next) {
        applyState(next);
        setNotice(`已选择目录：${next.saveDir}`);
        const pick = next.saves.find((save) => save.name === next.selectedName) ?? next.saves[0];
        if (pick) void doRead(pick, '已读取当前存档');
        else {
          openFileRef.current = null;
          setNotice(`已选择目录：${next.saveDir}，但里面没有 ${SAVE_EXTENSION[site].hint}`);
        }
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [applyState, doRead, site]);

  const onSelectSlot = useCallback(async (name: string) => {
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const nextName = name === '__latest__' ? '' : name;
    await bridge.setSelected(nextName, site);
    setState((previous) => ({ ...previous, selectedName: nextName }));
    const pick = state.saves.find((save) => save.name === nextName) ?? state.saves[0];
    if (pick) void doRead(pick, '已切换存档位');
  }, [state.saves, doRead, site]);

  const onToggleFollow = useCallback(async () => {
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const next = !state.autoFollow;
    await bridge.setAutoFollow(next, site);
    if (next) openFileRef.current = null;
    setState((previous) => ({ ...previous, autoFollow: next }));
    setNotice(next ? '自动跟随已开启：游戏一存档就刷新' : '自动跟随已关闭');
    if (next && activeSave) void doRead(activeSave, '自动跟随已开启');
  }, [state.autoFollow, activeSave, doRead, site]);

  return {
    state, externalSave, busy, notice, error, lastRead, activeSave,
    onChooseDir, onSelectSlot, onToggleFollow,
    onRead: () => void doRead(activeSave, '已读取当前存档'),
    onNavigate: (target: 'case' | 'sweet' | 'home') => { window.location.hash = `#/${target}`; },
  };
}
