import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* Verify progress save transfer (multi-device):
   1. the panel offers 导出文件 / 复制文本 / 导入文件 / 粘贴文本
   2. 导出文件 really downloads an archive named MXZY3-进度-<stamp>.json
   3. 复制文本 puts a valid archive (format, version, exportedAt, summary,
      data.lines) on the clipboard
   4. the archive survives a localStorage wipe + reload
   5. file import shows a preview and 合并 restores the ticks
   6. 覆盖 needs a second click, and replaces rather than merges
   7. a broken paste is rejected with an error and changes nothing
   8. a bare TrackerData blob (no envelope) is still accepted
   9. imported progress is persisted (survives another reload)
   Usage: node cdp_tracker_transfer.mjs [url] */
const [, , argUrl] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
const origin = new URL(url).origin;

function jsonPut(target) {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'PUT' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function jsonGet(target) {
  return new Promise((resolve, reject) => {
    http.get(target, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    }).on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCOPE = `(document.querySelector('[data-tracker-app]') || document)`;

const PANEL = `(() => {
  const root = ${SCOPE};
  const panel = root.querySelector('[data-transfer-panel]');
  const notice = panel?.querySelector('[data-transfer-notice]');
  const preview = panel?.querySelector('[data-transfer-preview]');
  return JSON.stringify({
    exists: !!panel,
    heading: panel?.querySelector('h2')?.textContent?.trim() ?? null,
    buttons: panel ? [...panel.querySelectorAll('button[data-transfer-export],button[data-transfer-copy],button[data-transfer-import],button[data-transfer-paste]')].map(b => b.textContent.trim()) : [],
    preview: preview ? preview.textContent.replace(/\\s+/g, ' ').trim() : null,
    replaceLabel: panel?.querySelector('[data-transfer-replace]')?.textContent?.trim() ?? null,
    notice: notice ? notice.textContent.trim() : null,
    tone: notice?.getAttribute('data-tone') ?? null,
    pasteOpen: !!panel?.querySelector('[data-transfer-paste-input]'),
  });
})()`;

const LINE = (id) => `(() => {
  const card = (${SCOPE}).querySelector('[data-line-card][data-line-id="${id}"]');
  if (!card) return JSON.stringify({ found: false });
  const rows = [...card.querySelectorAll('[data-step-row]')];
  return JSON.stringify({
    found: true,
    rows: rows.length,
    done: rows.filter(r => r.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed') === 'true').length,
    progress: card.querySelector('[data-line-progress]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
  });
})()`;

async function main() {
  // Downloads and clipboard both need an explicit grant in headless Chrome.
  const downloadDir = path.join(os.tmpdir(), 'cdp-transfer-' + Date.now());
  fs.mkdirSync(downloadDir, { recursive: true });
  const version = await jsonGet('http://127.0.0.1:9339/json/version');
  const browserWs = new WebSocket(version.webSocketDebuggerUrl);
  const downloads = [];
  let browserId = 0;
  const browserPending = new Map();
  browserWs.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Browser.downloadWillBegin') downloads.push(msg.params);
    if (msg.id && browserPending.has(msg.id)) {
      const resolve = browserPending.get(msg.id);
      browserPending.delete(msg.id);
      resolve(msg.result ?? msg.error);
    }
  };
  await new Promise((r) => (browserWs.onopen = r));
  const browserSend = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++browserId;
      browserPending.set(id, resolve);
      browserWs.send(JSON.stringify({ id, method, params }));
    });
  await browserSend('Browser.grantPermissions', {
    origin,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  });
  await browserSend('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
    eventsEnabled: true,
  });

  const target = await jsonPut('http://127.0.0.1:9339/json/new?' + encodeURIComponent(url));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('DOM.enable');
  await send('Page.navigate', { url });
  await sleep(3500);

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.value;
  };

  const waitFor = async (expression, label, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = await evaluate(expression);
      if (value) return value;
      await sleep(350);
    }
    throw new Error('timeout waiting for ' + label);
  };

  const panel = () => evaluate(PANEL).then(JSON.parse);
  const line = (lineId) => evaluate(LINE(lineId)).then(JSON.parse);
  const fail = (message) => { throw new Error(message); };

  const click = (selector) => evaluate(`(() => {
    const el = (${SCOPE}).querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);

  const reload = async () => {
    await send('Page.reload');
    await sleep(3500);
    await waitFor(
      `(${SCOPE}).querySelector('[data-active-pool] [data-line-card]') ? 'ok' : ''`,
      'pool after reload',
    );
  };

  /** Expanded cards are the only ones rendering step rows. */
  const ensureExpanded = async (lineId, tries = 20) => {
    for (let i = 0; i < tries; i += 1) {
      const state = JSON.parse(await evaluate(`(() => {
        const card = (${SCOPE}).querySelector('[data-line-card][data-line-id="${lineId}"]');
        if (!card) return JSON.stringify({ rows: 0, expanded: null });
        return JSON.stringify({
          rows: card.querySelectorAll('[data-step-row]').length,
          expanded: card.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded') ?? null,
        });
      })()`));
      if (state.rows > 0) return state.rows;
      if (state.expanded === 'false') {
        await evaluate(`(() => {
          const card = (${SCOPE}).querySelector('[data-line-card][data-line-id="${lineId}"]');
          card?.querySelector('button[aria-expanded]')?.click();
          return 1;
        })()`);
      }
      await sleep(400);
    }
    throw new Error('could not expand line ' + lineId);
  };

  const setFile = async (filePath) => {
    const { root } = await send('DOM.getDocument', { depth: 2 });
    const { nodeId } = await send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '[data-transfer-input]',
    });
    if (!nodeId) fail('file input is missing');
    await send('DOM.setFileInputFiles', { nodeId, files: [filePath] });
    await sleep(700);
  };

  await evaluate(`localStorage.removeItem('guide.progress.v1'); 1`);
  await reload();

  // Panel basics.
  const initial = await panel();
  console.log('PANEL', JSON.stringify(initial));
  if (!initial.exists) fail('progress archive panel is missing');
  if (initial.heading !== '进度存档') fail('panel heading changed: ' + initial.heading);
  if (initial.buttons.join('|') !== '导出文件|复制文本|导入文件|粘贴文本') {
    fail('unexpected panel buttons: ' + initial.buttons.join('|'));
  }

  // Baseline: tick two steps on the first card.
  const lineId = await evaluate(`(${SCOPE}).querySelector('[data-active-pool] [data-line-card]').getAttribute('data-line-id')`);
  const rowCount = await ensureExpanded(lineId);
  if (rowCount < 3) fail('first card needs at least 3 steps for this test');
  await sleep(200);

  const tick = (index) => evaluate(`(() => {
    const card = (${SCOPE}).querySelector('[data-line-card][data-line-id="${lineId}"]');
    card.querySelectorAll('[data-step-row]')[${index}].querySelector('button[aria-pressed]').click();
    return 1;
  })()`);

  await tick(0);
  await sleep(200);
  await tick(1);
  await sleep(300);
  const ticked = await line(lineId);
  console.log('TICKED', JSON.stringify({ lineId, done: ticked.done, progress: ticked.progress }));
  if (ticked.done !== 2) fail('baseline ticks did not register');

  // 1. 导出文件 → a real download with the expected name and a valid body.
  await click('[data-transfer-export]');
  await sleep(1200);
  const exportPanel = await panel();
  const download = downloads[downloads.length - 1];
  console.log('DOWNLOAD', JSON.stringify({ count: downloads.length, name: download?.suggestedFilename, notice: exportPanel.notice }));
  if (!download) fail('导出文件 did not start a download');
  if (!/^MXZY3-进度-\d{8}-\d{4}\.json$/.test(download.suggestedFilename)) {
    fail('unexpected download name: ' + download.suggestedFilename);
  }
  const downloadedPath = path.join(downloadDir, download.suggestedFilename);
  let downloadedRaw = null;
  for (let i = 0; i < 20 && downloadedRaw === null; i += 1) {
    if (fs.existsSync(downloadedPath)) downloadedRaw = fs.readFileSync(downloadedPath, 'utf8');
    else await sleep(150);
  }
  if (!downloadedRaw) fail('downloaded archive never landed on disk');
  const downloaded = JSON.parse(downloadedRaw);
  if (downloaded.format !== 'stardom3-tracker-save') fail('downloaded archive format is wrong');
  if (!downloaded.data?.lines?.[lineId]) fail('downloaded archive lost the ticked line');
  if (exportPanel.tone !== 'ok') fail('export did not report success');

  // 2. 复制文本 → clipboard holds the same archive.
  if (!(await click('[data-transfer-copy]'))) fail('copy button not clickable');
  await sleep(400);
  const copiedText = await evaluate('navigator.clipboard.readText()');
  let archive;
  try {
    archive = JSON.parse(copiedText);
  } catch {
    fail('clipboard did not contain JSON: ' + String(copiedText).slice(0, 80));
  }
  console.log('COPIED_ARCHIVE', JSON.stringify({
    format: archive.format, version: archive.version,
    exportedAt: archive.exportedAt, summary: archive.summary,
  }));
  if (archive.format !== 'stardom3-tracker-save') fail('archive format marker is wrong');
  if (archive.version !== 1) fail('archive version is wrong');
  if (!archive.exportedAt || Number.isNaN(Date.parse(archive.exportedAt))) fail('archive has no export time');
  if (!archive.data?.lines?.[lineId]) fail('archive lost the ticked line');
  if (archive.data.lines[lineId].done.length !== 2) {
    fail('archive done set is ' + JSON.stringify(archive.data.lines[lineId].done));
  }
  if (archive.summary.steps < 2) fail('archive summary does not count the steps');
  if (archive.summary.lines < 1) fail('summary missing line count');
  if ((await panel()).tone !== 'ok') fail('copy did not report success');

  const archivePath = path.join(downloadDir, 'archive-for-import.json');
  fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2), 'utf8');

  // 3. Wipe local progress: the ticks must be gone.
  await evaluate(`localStorage.removeItem('guide.progress.v1'); 1`);
  await reload();
  await waitFor(
    `(${SCOPE}).querySelector('[data-line-card][data-line-id="${lineId}"]') ? 'ok' : ''`,
    'wiped card',
  );
  if ((await line(lineId)).done !== 0) fail('progress was not wiped');
  await ensureExpanded(lineId);

  // 4. File import → preview → 合并 restores the ticks.
  await setFile(archivePath);
  const preview = await panel();
  console.log('PREVIEW_AFTER_FILE', JSON.stringify(preview));
  if (!preview.preview) fail('file import did not show a preview');
  if (!/导出/.test(preview.preview)) fail('preview does not show the export time');
  if (!/位艺人/.test(preview.preview)) fail('preview does not show the summary');

  await click('[data-transfer-merge]');
  await sleep(500);
  const merged = await line(lineId);
  const mergedPanel = await panel();
  console.log('AFTER_MERGE', JSON.stringify({ done: merged.done, notice: mergedPanel.notice }));
  if (merged.done !== 2) fail('merge did not restore the ticks, got ' + merged.done);
  if (mergedPanel.tone !== 'ok') fail('merge did not report success');
  if (mergedPanel.preview) fail('preview should close after applying');

  // 5. Overwrite path: an extra local tick must disappear, two clicks required.
  await tick(2);
  await sleep(300);
  const extra = await line(lineId);
  if (extra.done !== 3) fail('extra tick did not register, got ' + extra.done);

  await setFile(archivePath);
  await click('[data-transfer-replace]');
  await sleep(400);
  const armed = await panel();
  const stillThere = await line(lineId);
  console.log('REPLACE_ARMED', JSON.stringify({ label: armed.replaceLabel, done: stillThere.done }));
  if (armed.replaceLabel !== '确认覆盖？') fail('overwrite did not ask for confirmation: ' + armed.replaceLabel);
  if (stillThere.done !== 3) fail('first overwrite click must not apply anything');

  await click('[data-transfer-replace]');
  await sleep(500);
  const replaced = await line(lineId);
  const replacedPanel = await panel();
  console.log('AFTER_REPLACE', JSON.stringify({ done: replaced.done, notice: replacedPanel.notice }));
  if (replaced.done !== 2) fail('overwrite did not restore the archive state, got ' + replaced.done);
  if (!/覆盖/.test(replacedPanel.notice ?? '')) fail('overwrite did not report success');

  // 6. Broken paste is rejected and leaves progress alone.
  await click('[data-transfer-paste]');
  await sleep(300);
  const paste = async (text) => {
    await evaluate(`(() => {
      const area = (${SCOPE}).querySelector('[data-transfer-paste-input]');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(area, ${JSON.stringify(text)});
      area.dispatchEvent(new Event('input', { bubbles: true }));
      return 1;
    })()`);
    await sleep(200);
    await click('[data-transfer-read]');
    await sleep(400);
  };
  await paste('{ this is not a save ');
  const broken = await panel();
  const afterBroken = await line(lineId);
  console.log('BROKEN_PASTE', JSON.stringify({ tone: broken.tone, notice: broken.notice, done: afterBroken.done }));
  if (broken.tone !== 'error') fail('broken paste was not rejected');
  if (broken.preview) fail('broken paste still produced a preview');
  if (afterBroken.done !== 2) fail('broken paste changed progress');

  // 7. A bare TrackerData blob (no envelope) is accepted for compatibility.
  await paste(JSON.stringify(archive.data));
  const bare = await panel();
  console.log('BARE_PASTE', JSON.stringify({ preview: bare.preview, tone: bare.tone }));
  if (!bare.preview || bare.tone === 'error') fail('bare progress data was not accepted');
  await click('[data-transfer-cancel]');
  await sleep(300);
  if ((await panel()).preview) fail('cancel did not close the preview');

  // 8. The imported progress survives a reload.
  await reload();
  await waitFor(
    `(${SCOPE}).querySelector('[data-line-card][data-line-id="${lineId}"]') ? 'ok' : ''`,
    'card after reload',
  );
  await ensureExpanded(lineId);
  const persisted = await line(lineId);
  console.log('AFTER_RELOAD', JSON.stringify({ done: persisted.done }));
  if (persisted.done !== 2) fail('imported progress did not persist');

  console.log('ALL_CHECKS_PASSED');
  ws.close();
  browserWs.close();
}

main().catch((error) => {
  console.error('CDP error:', error.message);
  process.exit(1);
});
