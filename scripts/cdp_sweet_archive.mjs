import http from 'node:http';

/* 甜蜜乐章「全部存档」回归：CG 图鉴顶栏的入口 + 甜站自己的统一存档信封。
   1) CG 图鉴顶栏有「全部存档」按钮，点开是同一个 SaveArchivePanel；
   2) 面板文案讲「进度与 CG 收藏」，一个字都不提六大通告；
   3) 导出的文件是 `sweet-save`，含 tracker 与 cg 两段，文件名前缀「甜蜜乐章」；
   4) 导入只含 CG 的甜站存档：预览给出张数，合并后写 `sweet.cg.v1` 且与本机取并集，
      同时绝不碰主站的 `guide.cg.v1`（两站隔离）；
   5) 主站 `mxzy3-save` 丢进甜站要被拒绝（不会串味），旧版 `sweet-tracker-save`
      仍然认，只是预览里没有 CG 那段。

   Usage: node scripts/cdp_sweet_archive.mjs
   前置：dev server 5173 + Chrome 调试端口 9339。 */

const PORT = '9339';
const BASE_HTTP = `http://127.0.0.1:${PORT}`;
const SWEET_CG = 'http://localhost:5173/sweet.html#/cg';

function jsonPut(target) {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'PUT' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
let checksTotal = 0;
const check = (label, ok, extra = '') => {
  checksTotal += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
  if (!ok) failures.push(label);
};

/** 甜站统一存档（只带 CG 那段，进度题另在两站各自的追踪器回归里覆盖）。 */
const sweetSave = (collected) => JSON.stringify({
  format: 'sweet-save',
  version: 1,
  exportedAt: '2026-11-13T10:00:00.000Z',
  summary: {
    trackerLines: 0,
    cgCollected: collected.length,
    hasCg: true,
    specialsEnabled: 0,
    hasSpecials: false,
  },
  cg: { version: 1, collected },
});

/** 旧版甜站 tracker-only 信封：仍应能导入，只是没有 CG 段。 */
const legacySweetTracker = () => JSON.stringify({
  format: 'sweet-tracker-save',
  version: 2,
  exportedAt: '',
  summary: { artists: 1, lines: 0, steps: 0 },
  data: {
    version: 1,
    selectedArtists: ['protagonist'],
    releasedArtists: [],
    lines: {},
    order: [],
    pinned: [],
  },
});

/** 主站统一存档：甜站必须拒绝。 */
const mainSave = () => JSON.stringify({
  format: 'mxzy3-save',
  version: 1,
  exportedAt: '',
  summary: {
    trackerLines: 0,
    cgCollected: 1,
    hasCg: true,
    specialsEnabled: 0,
    hasSpecials: false,
  },
  cg: { version: 1, collected: ['ji-5'] },
});

async function main() {
  const target = await jsonPut(`${BASE_HTTP}/json/new?${encodeURIComponent(SWEET_CG)}`);
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
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', { url: SWEET_CG });
  await sleep(3500);

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  // 干净 slate：本机先有一张已收集（protagonist-1，真实数据里存在），主站键留空用于隔离对照。
  await evaluate(`(() => {
    localStorage.clear();
    localStorage.setItem('sweet.cg.v1', JSON.stringify({ version: 1, collected: ['protagonist-1'] }));
    return 1;
  })()`);
  await send('Page.reload');
  await sleep(3200);

  // 1) CG 图鉴顶栏入口
  const hasButton = await evaluate(`!!document.querySelector('[data-cg-archive]')`);
  check('CG 图鉴顶栏有「全部存档」按钮', hasButton, '');
  if (!hasButton) {
    console.log(`\n${checksTotal - failures.length}/${checksTotal} passed`);
    process.exit(1);
  }
  await evaluate(`document.querySelector('[data-cg-archive]').click()`);
  await sleep(500);
  const modal = await evaluate(`({
    modal: !!document.querySelector('[data-cg-archive-modal]'),
    panel: !!document.querySelector('[data-cg-archive-modal] [data-transfer-panel]'),
  })`);
  check('点开后是同一个存档面板弹窗', modal.modal && modal.panel, JSON.stringify(modal));

  const panelText = await evaluate(
    `document.querySelector('[data-transfer-panel]')?.textContent ?? ''`,
  );
  check('面板文案讲「进度与 CG 收藏」', panelText.includes('进度与 CG 收藏'), panelText.slice(0, 60));
  check('面板文案不提六大通告', !panelText.includes('六大通告'), panelText.slice(0, 60));

  // 2) 导出：拦截 blob，顺带看文件名
  await evaluate(`(() => {
    window.__captured = null;
    window.__capturedName = '';
    const create = document.createElement.bind(document);
    document.createElement = function (tag) {
      const el = create(tag);
      if (tag === 'a') {
        el.click = function () {
          if (el.href && el.href.indexOf('blob:') === 0) {
            window.__capturedName = el.download || '';
            fetch(el.href).then((r) => r.text()).then((t) => { window.__captured = t; }).catch(() => {});
          }
        };
      }
      return el;
    };
    return 1;
  })()`);
  await evaluate(`document.querySelector('[data-transfer-export]').click()`);
  await sleep(900);
  const captured = await evaluate(`window.__captured`);
  const fileName = await evaluate(`window.__capturedName`);
  check('导出文件名为「甜蜜乐章-存档-….json」',
    typeof fileName === 'string' && /^甜蜜乐章-存档-\d{8}-\d{4}\.json$/.test(fileName), fileName || '');
  let exported = null;
  try { exported = JSON.parse(captured || 'null'); } catch { exported = null; }
  check('导出信封是 sweet-save', exported?.format === 'sweet-save', exported?.format || 'none');
  check('导出含 tracker 与 cg 两段',
    Boolean(exported?.tracker) && Array.isArray(exported?.cg?.collected), '');
  check('导出不含六大通告段', exported ? !exported.specials : false, '');
  check('导出带上本机已收集的 CG',
    Array.isArray(exported?.cg?.collected) && exported.cg.collected.includes('protagonist-1'),
    JSON.stringify(exported?.cg?.collected ?? null));

  // 3) 导入甜站存档：预览张数 + 并集写入 + 不碰主站键
  const ensurePasteOpen = async () => {
    const open = await evaluate(`!!document.querySelector('[data-transfer-paste-input]')`);
    if (!open) {
      await evaluate(`document.querySelector('[data-transfer-paste]').click()`);
      await sleep(200);
    }
  };
  const pasteRead = async (json) => {
    await ensurePasteOpen();
    await evaluate(`(() => {
      const ta = document.querySelector('[data-transfer-paste-input]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(json)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return 1;
    })()`);
    await sleep(150);
    await evaluate(`document.querySelector('[data-transfer-read]').click()`);
    await sleep(350);
  };

  await pasteRead(sweetSave(['danisi-1', 'shi-difen-1']));
  const preview = await evaluate(
    `document.querySelector('[data-transfer-preview]')?.textContent ?? ''`,
  );
  check('预览给出「2 张 CG 已收集」', /2 张 CG 已收集/.test(preview), preview.slice(0, 80));
  await evaluate(`document.querySelector('[data-transfer-merge]').click()`);
  await sleep(400);
  const stored = await evaluate(`(() => {
    const raw = localStorage.getItem('sweet.cg.v1');
    const main = localStorage.getItem('guide.cg.v1');
    return {
      sweet: raw ? (JSON.parse(raw).collected || []) : null,
      main: main ? (JSON.parse(main).collected || []) : null,
    };
  })()`);
  check('合并后甜站 CG 取并集',
    Array.isArray(stored.sweet)
      && ['protagonist-1', 'danisi-1', 'shi-difen-1'].every((x) => stored.sweet.includes(x)),
    JSON.stringify(stored.sweet));
  check('甜站导入不写主站 guide.cg.v1', stored.main === null, JSON.stringify(stored.main));

  // 4) 跨站隔离：主站存档要被拒
  await pasteRead(mainSave());
  const rejected = await evaluate(`(() => {
    const n = document.querySelector('[data-transfer-notice]');
    return {
      preview: !!document.querySelector('[data-transfer-preview]'),
      tone: n ? n.getAttribute('data-tone') : '',
      text: n ? n.textContent : '',
    };
  })()`);
  check('主站存档在甜站被拒绝（不弹预览）',
    rejected.preview === false && rejected.tone === 'error', JSON.stringify(rejected));

  // 5) 旧版 tracker-only 存档仍可导入，只是没有 CG 那段
  await pasteRead(legacySweetTracker());
  const legacyPreview = await evaluate(`(() => {
    const p = document.querySelector('[data-transfer-preview]');
    return { shown: !!p, text: p ? p.textContent : '' };
  })()`);
  check('旧版 sweet-tracker-save 仍能读', legacyPreview.shown, legacyPreview.text.slice(0, 80));
  check('旧版存档预览标明不含 CG 收集', legacyPreview.text.includes('不含 CG 收集'),
    legacyPreview.text.slice(0, 80));

  // 6) Esc 关弹窗
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(300);
  const closed = await evaluate(`!document.querySelector('[data-cg-archive-modal]')`);
  check('Esc 可关闭存档弹窗', closed, '');

  console.log(`\n${checksTotal - failures.length}/${checksTotal} passed`);
  if (failures.length) {
    console.log('FAILURES:', failures.join(' | '));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
