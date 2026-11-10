import http from 'node:http';
import fs from 'node:fs';

/* End-to-end check of the unified save panel (CG modal + tracker rail):
   1. CG page: "全部存档" button opens a modal containing the transfer panel.
   2. Import a test save via the hidden file input -> preview shows CG count.
   3. Merge -> localStorage guide.cg.v1 gains the imported CG ids.
   4. Tracker page: the rail panel renders with the "全部存档" heading. */

const PORT = '9339';
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_FILE = 'E:/Projects/mxzy3-guide/outputs/savearchive-test.json';
const URL_CG = 'http://localhost:5173/#/cg';

function jsonPut(target, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const req = http.request(target, {
      method: 'PUT',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const target = await jsonPut(`${BASE}/json/new?` + encodeURIComponent(URL_CG));
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
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  await send('Page.navigate', { url: URL_CG });
  await sleep(3500);

  // Reset CG collection so the import result is unambiguous.
  await send('Runtime.evaluate', {
    expression: `localStorage.removeItem('guide.cg.v1'); 'cleared'`,
  });

  // Open the archive modal.
  const openRes = await send('Runtime.evaluate', {
    expression: `(function(){
      var b = document.querySelector('[data-cg-archive]');
      if(!b) return JSON.stringify({ok:false, why:'no button'});
      b.click();
      return JSON.stringify({ok:true});
    })()`,
  });
  const open = JSON.parse(openRes.result.value);
  if (!open.ok) throw new Error('CG archive button: ' + open.why);
  await sleep(600);

  const modal = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      modal: !!document.querySelector('[data-cg-archive-modal]'),
      panel: !!document.querySelector('[data-cg-archive-modal] [data-transfer-panel]')
    })`,
  });
  const m = JSON.parse(modal.result.value);
  console.log('modal+panel:', JSON.stringify(m));
  if (!m.modal || !m.panel) throw new Error('archive modal/panel not rendered');

  // Inject the test file into the hidden input.
  const doc = await send('DOM.getDocument', { depth: -1 });
  const q = await send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '[data-transfer-input]',
  });
  if (!q.nodeId) throw new Error('transfer file input not found');
  await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [TEST_FILE] });
  await sleep(700);

  const prev = await send('Runtime.evaluate', {
    expression: `(function(){
      var p = document.querySelector('[data-transfer-preview]');
      if(!p) return JSON.stringify({ok:false});
      return JSON.stringify({ok:true, text: p.innerText});
    })()`,
  });
  const pv = JSON.parse(prev.result.value);
  console.log('preview:', JSON.stringify(pv));
  if (!pv.ok) throw new Error('import preview not shown');
  if (!/2 张 CG 已收集/.test(pv.text)) throw new Error('preview missing CG count: ' + pv.text);

  // Merge.
  await send('Runtime.evaluate', {
    expression: `document.querySelector('[data-transfer-merge]').click()`,
  });
  await sleep(500);

  const ls = await send('Runtime.evaluate', {
    expression: `(function(){
      var raw = localStorage.getItem('guide.cg.v1');
      if(!raw) return JSON.stringify({collected:null});
      var d = JSON.parse(raw);
      return JSON.stringify({collected: d.collected});
    })()`,
  });
  const cg = JSON.parse(ls.result.value);
  console.log('cg after merge:', JSON.stringify(cg));
  const hasIds = Array.isArray(cg.collected) && cg.collected.includes('ji-5') && cg.collected.includes('ou-9');
  if (!hasIds) throw new Error('imported CG ids not persisted');

  // Tracker page panel.
  await send('Page.navigate', { url: 'http://localhost:5173/#/tracker' });
  await sleep(3500);
  const trk = await send('Runtime.evaluate', {
    expression: `(function(){
      var p = document.querySelector('[data-transfer-panel]');
      if(!p) return JSON.stringify({ok:false});
      var h = p.querySelector('h2');
      return JSON.stringify({ok:true, heading: h ? h.textContent : null});
    })()`,
  });
  const t = JSON.parse(trk.result.value);
  console.log('tracker panel:', JSON.stringify(t));
  if (!t.ok) throw new Error('tracker transfer panel missing');
  if (!/全部存档/.test(t.heading || '')) throw new Error('tracker panel heading wrong: ' + t.heading);

  // Export check: headless Chrome blocks the real file download, so hook the
  // in-page blob the export builds and read its text to confirm the unified
  // save carries both the tracker envelope and the CG collection.
  await send('Runtime.evaluate', {
    expression: `(function(){
      window.__captured = null;
      var oc = document.createElement.bind(document);
      document.createElement = function(tag){
        var el = oc(tag);
        if(tag === 'a'){
          var real = el.click.bind(el);
          el.click = function(){
            if(el.href && el.href.indexOf('blob:')===0){
              fetch(el.href).then(function(r){return r.text();}).then(function(t){window.__captured=t;}).catch(function(){});
            }
          };
        }
        return el;
      };
      return 'hooked';
    })()`,
  });
  await send('Runtime.evaluate', {
    expression: `document.querySelector('[data-transfer-export]').click()`,
  });
  await sleep(900);
  const cap = await send('Runtime.evaluate', { expression: `window.__captured` });
  if (!cap.result.value) throw new Error('export did not produce a blob');
  const exported = JSON.parse(cap.result.value);
  console.log('exported:', JSON.stringify({
    format: exported.format,
    hasTracker: !!exported.tracker,
    cgCount: exported.cg ? exported.cg.collected.length : 0,
  }));
  if (exported.format !== 'mxzy3-save') throw new Error('export format wrong');
  if (!exported.tracker) throw new Error('export missing tracker');
  if (!exported.cg || !Array.isArray(exported.cg.collected)) throw new Error('export missing cg');
  if (!exported.cg.collected.includes('ji-5')) throw new Error('export cg missing imported id');

  console.log('ALL CHECKS PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
