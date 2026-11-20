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
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop:state', listener);
    return () => ipcRenderer.removeListener('desktop:state', listener);
  },
});
