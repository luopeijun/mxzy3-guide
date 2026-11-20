/* 渲染进程桥：只暴露存档读取所需的最小接口，不开放任何写文件或系统能力。 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  getState: () => ipcRenderer.invoke('desktop:getState'),
  chooseDir: () => ipcRenderer.invoke('desktop:chooseDir'),
  refresh: () => ipcRenderer.invoke('desktop:refresh'),
  setAutoFollow: (enabled) => ipcRenderer.invoke('desktop:setAutoFollow', enabled),
  setSelected: (name) => ipcRenderer.invoke('desktop:setSelected', name),
  readSave: async (filePath) => {
    const bytes = await ipcRenderer.invoke('desktop:readSave', filePath);
    // 克隆回来的 Uint8Array 转成 ArrayBuffer，交给现有 parseSave。
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  },
  /** File → 打开存档。目录里的档位由界面按钮走 readSave，这里专供菜单。
   *  pickedPath 仅供回归脚本跳过系统对话框，正常从菜单进来是 undefined。 */
  openSave: (pickedPath) => ipcRenderer.invoke('desktop:openSave', pickedPath),
  requestReload: () => ipcRenderer.invoke('desktop:requestReload'),
  onOpenSave: (callback) => {
    const listener = (_event, payload) => {
      const bytes = payload?.bytes;
      if (!bytes) return;
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      callback({ name: payload.name, path: payload.path, buffer: copy.buffer });
    };
    ipcRenderer.on('desktop:openSaveResult', listener);
    return () => ipcRenderer.removeListener('desktop:openSaveResult', listener);
  },
  onReloadRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('desktop:reloadRequest', listener);
    return () => ipcRenderer.removeListener('desktop:reloadRequest', listener);
  },
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop:state', listener);
    return () => ipcRenderer.removeListener('desktop:state', listener);
  },
});
