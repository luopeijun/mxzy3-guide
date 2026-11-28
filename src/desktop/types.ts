/** 桌面版两个游戏各自一套存档目录与档位选择，互不串用。 */
export type Site = 'main' | 'sweet';

export interface SaveFile {
  name: string;
  path: string;
  mtime: number;
  size: number;
}

export interface DesktopState {
  saveDir: string;
  autoFollow: boolean;
  selectedName: string;
  saves: SaveFile[];
}

export interface StateEvent extends DesktopState {
  site: Site;
}

export interface ExternalSave {
  buffer: ArrayBuffer;
  name: string;
  token: number;
}

export interface DesktopBridge {
  getState(site?: Site): Promise<DesktopState>;
  chooseDir(site?: Site): Promise<DesktopState | null>;
  refresh(site?: Site): Promise<DesktopState>;
  setAutoFollow(enabled: boolean, site?: Site): Promise<boolean>;
  setSelected(name: string, site?: Site): Promise<string>;
  setSite(site: Site): Promise<Site>;
  readSave(filePath: string): Promise<ArrayBuffer>;
  openSave(pickedPath?: string): Promise<boolean>;
  requestReload(): Promise<boolean>;
  onOpenSave(callback: (save: { name: string; path: string; buffer: ArrayBuffer }) => void): () => void;
  onReloadRequest(callback: () => void): () => void;
  onState(callback: (state: StateEvent) => void): () => void;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export const EMPTY_STATE: DesktopState = { saveDir: '', autoFollow: false, selectedName: '', saves: [] };

export const SITE_LABEL: Record<Site, string> = {
  main: '明星志愿3',
  sweet: '甜蜜乐章',
};

/** 存档目录里只有游戏真正写出的档位才算数；.mem 是内存镜像，不是存档。 */
export const SAVE_EXTENSION: Record<Site, { pattern: RegExp; hint: string; accept: string }> = {
  main: { pattern: /\.sa2$/i, hint: '.sa2 存档', accept: '.sa2' },
  sweet: { pattern: /\.(sav|bak)$/i, hint: '.sav 存档', accept: '.sav,.bak' },
};
