/* Electron 主进程：只做三件事——把 dist 目录经自定义协议喂给页面（本地 JSON
 * 的 fetch 在 file:// 下会被浏览器拦掉）、向渲染进程提供只读的存档文件桥、
 * 以及监听用户选定的 Save2 目录变化。绝不回写存档。 */
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

/** 打包后的 dist 目录；开发模式下不走这个协议。 */
const distDir = path.join(__dirname, '..', 'dist');
const configPath = () => path.join(app.getPath('userData'), 'desktop-config.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// 必须在 app.whenReady 之前声明为标准协议，相对路径与 fetch 才会正常解析。
protocol.registerSchemesAsPrivileged([
  { scheme: 'mxzy', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
]);

let mainWindow = null;
let watcher = null;
let notifyTimer = null;

async function readConfig() {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    const cfg = JSON.parse(raw);
    return {
      saveDir: typeof cfg.saveDir === 'string' ? cfg.saveDir : '',
      autoFollow: Boolean(cfg.autoFollow),
      selectedName: typeof cfg.selectedName === 'string' ? cfg.selectedName : '',
    };
  } catch {
    return { saveDir: '', autoFollow: false, selectedName: '' };
  }
}

async function writeConfig(patch) {
  const next = { ...(await readConfig()), ...patch };
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

async function listSaves(dir) {
  if (!dir) return [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/\.sa2$/i.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const stat = await fs.stat(full);
      files.push({ name: entry.name, path: full, mtime: stat.mtimeMs, size: stat.size });
    }
    files.sort((a, b) => b.mtime - a.mtime);
    return files;
  } catch {
    return [];
  }
}

/** 游戏跑着的时候 Auto.sa2 可能正在被写：读前后各 stat 一次，大小 / 修改时间
 *  不一致就等一下重读，避免把半截文件交给解析器。只读，绝不写回。 */
async function readSaveStable(filePath) {
  let last = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const before = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);
    const after = await fs.stat(filePath);
    last = buffer;
    if (before.size === after.size && before.mtimeMs === after.mtimeMs && buffer.length === before.size) {
      return buffer;
    }
    await new Promise((resolve) => setTimeout(resolve, 90));
  }
  return last;
}

function sendState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  void (async () => {
    const cfg = await readConfig();
    mainWindow.webContents.send('desktop:state', {
      ...cfg,
      saves: await listSaves(cfg.saveDir),
    });
  })();
}

function stopWatch() {
  if (notifyTimer) { clearTimeout(notifyTimer); notifyTimer = null; }
  if (watcher) { watcher.close(); watcher = null; }
}

function startWatch(dir) {
  stopWatch();
  if (!dir) return;
  try {
    watcher = fsSync.watch(dir, { persistent: false }, () => {
      if (notifyTimer) clearTimeout(notifyTimer);
      notifyTimer = setTimeout(sendState, 350);
    });
    watcher.on('error', () => stopWatch());
  } catch {
    stopWatch();
  }
}

function registerProtocol() {
  protocol.handle('mxzy', async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (!pathname || pathname === '/') pathname = '/desktop.html';
    const full = path.join(distDir, pathname);
    if (!full.startsWith(distDir)) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      const buffer = await fs.readFile(full);
      const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
      return new Response(buffer, { status: 200, headers: { 'content-type': type } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

/** 原生 File 菜单：打开存档走系统文件框，读到字节后推给渲染层，
 *  和目录里点「读取当前游戏状态」共用同一条 feedSave 通道，不另开解析路径。
 *  reload 也由主进程发事件，渲染层自己决定重读目录档位还是上次打开的文件。 */
async function openSaveFromFile(pickedPath) {
  let filePath = pickedPath;
  if (!filePath) {
    const cfg = await readConfig();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '打开存档（.sa2）',
      defaultPath: cfg.saveDir || undefined,
      filters: [
        { name: '明星志愿3 存档', extensions: ['sa2'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return false;
    filePath = result.filePaths[0];
  }
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    throw new Error('存档路径无效');
  }
  const buffer = await readSaveStable(filePath);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop:openSaveResult', {
      name: path.basename(filePath),
      path: filePath,
      bytes: new Uint8Array(buffer),
    });
  }
  return true;
}

function requestReload() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop:reloadRequest');
  }
}

function registerMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: '打开存档…', accelerator: 'CmdOrCtrl+O', click: () => { void openSaveFromFile(); } },
        { label: '重新载入当前存档', accelerator: 'CmdOrCtrl+R', click: () => { requestReload(); } },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    { label: 'Help', submenu: [{ role: 'about' }] },
  ]));
}

function registerIpc() {
  ipcMain.handle('desktop:getState', async () => {
    const cfg = await readConfig();
    return { ...cfg, saves: await listSaves(cfg.saveDir) };
  });

  ipcMain.handle('desktop:chooseDir', async () => {
    const current = (await readConfig()).saveDir;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择游戏的 Save2 存档目录',
      defaultPath: current || undefined,
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const cfg = await writeConfig({ saveDir: result.filePaths[0], selectedName: '' });
    startWatch(cfg.saveDir);
    return { ...cfg, saves: await listSaves(cfg.saveDir) };
  });

  ipcMain.handle('desktop:setAutoFollow', async (_event, enabled) => {
    const cfg = await writeConfig({ autoFollow: Boolean(enabled) });
    return cfg.autoFollow;
  });

  ipcMain.handle('desktop:setSelected', async (_event, name) => {
    const cfg = await writeConfig({ selectedName: typeof name === 'string' ? name : '' });
    return cfg.selectedName;
  });

  ipcMain.handle('desktop:refresh', async () => {
    const cfg = await readConfig();
    return { ...cfg, saves: await listSaves(cfg.saveDir) };
  });

  ipcMain.handle('desktop:readSave', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      throw new Error('存档路径无效');
    }
    const buffer = await readSaveStable(filePath);
    // Buffer 经结构化克隆到渲染进程后是 Uint8Array，前端转 ArrayBuffer 解析。
    return new Uint8Array(buffer);
  });

  // 目录里点档位/自动跟随走 readSave；这里只服务 File 菜单的程序化入口，
  // 便于回归脚本不弹系统对话框也能触发同一条打开链路。
  ipcMain.handle('desktop:openSave', async (_event, filePath) => openSaveFromFile(filePath));
  ipcMain.handle('desktop:requestReload', async () => { requestReload(); return true; });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: '明星志愿3 · 存档解析',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.MXZY_DESKTOP_DEV_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadURL('mxzy://local/desktop.html#/case');
  }


  mainWindow.on('closed', () => {
    stopWatch();
    mainWindow = null;
  });
}

// 实测/排障用：MXZY_DESKTOP_DEBUG=9223 时开远程调试端口，不影响正常启动。
if (process.env.MXZY_DESKTOP_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.MXZY_DESKTOP_DEBUG);
}

app.whenReady().then(async () => {
  registerProtocol();
  registerIpc();
  registerMenu();
  await createWindow();
  const cfg = await readConfig();
  startWatch(cfg.saveDir);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
