import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// 打包时 signAndEditExecutable=false 会跳过 rcedit，exe 里仍是 Electron 默认图标。
// 打包后单独把 build/icon.ico（网页版 favicon 那张 logo）注入到 win-unpacked 的 exe。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const icon = path.join(root, 'build', 'icon.ico');
// 允许传输出目录（如 release-1172），旧打包目录被占用时仍能给新产物注入图标。
const unpacked = process.argv[2]
  ? path.resolve(root, process.argv[2], 'win-unpacked')
  : path.join(root, 'release', 'win-unpacked');

if (!fs.existsSync(icon)) throw new Error(`找不到图标: ${icon}`);
if (!fs.existsSync(unpacked)) throw new Error(`找不到打包目录: ${unpacked}，请先执行 npm run package:desktop`);

const exes = fs.readdirSync(unpacked).filter((f) => f.toLowerCase().endsWith('.exe'));
if (!exes.length) throw new Error(`打包目录里没有 exe: ${unpacked}`);

function locateRcedit() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const cache = path.join(local, 'electron-builder', 'Cache', 'winCodeSign');
  const candidates = [];
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache)) {
      candidates.push(path.join(cache, dir, 'rcedit-x64.exe'));
    }
  }
  candidates.push(path.join(root, 'node_modules', 'rcedit', 'bin', 'rcedit.exe'));
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('找不到 rcedit-x64.exe（electron-builder winCodeSign 缓存）');
  return found;
}

const rcedit = locateRcedit();
for (const exe of exes) {
  const target = path.join(unpacked, exe);
  execFileSync(rcedit, [target, '--set-icon', icon], { stdio: 'inherit' });
  console.log(`已注入网页版 logo: ${target}`);
}
