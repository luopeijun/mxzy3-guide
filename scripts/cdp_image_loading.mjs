/* 图片加载回归：缩略图是否真的生效、占位骨架在慢链路下是否出现并按时收起、
   灯箱是否先给缩略图再补原图、缩略图挂了能否自动退回原图。

   用 CDP 的 Fetch 域把图片请求暂停住，模拟「图还没来」的那一刻，
   这样骨架的断言不依赖网络快慢，稳定可复现。

   Usage: node scripts/cdp_image_loading.mjs [skeleton-shot.png]
   前置：dev server 5173 + Chrome 调试端口 9339。 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:5173';
const PAGE = `${BASE}/sweet.html#/cg/group/protagonist`;
/** 同一套组件也服务明星志愿3：回归必须覆盖两个站点，防止主站改回原图。 */
const MAIN_CG = `${BASE}/index.html#/cg`;
const MAIN_GUIDE = `${BASE}/index.html#/guide/characters/lin-fenfen`;
const [, , shot = ''] = process.argv;

const results = [];
const check = (label, ok, extra = '') => {
  results.push({ label, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function connect(url = PAGE, { pauseImages = false, failThumbs = false } = {}) {
  // 先开 about:blank 再导航，避免同 URL fragment 跳转导致注入脚本不执行。
  const target = await jsonPut(
    `http://127.0.0.1:9339/json/new?${encodeURIComponent('about:blank')}`,
  );
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const paused = [];
  const imageResponses = [];
  const failedRequests = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
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
    } else if (msg.method === 'Fetch.requestPaused') {
      if (failThumbs) {
        // 让缩略图像真实部署漏文件一样失败（网络错误），img 才会正常触发 error。
        send('Fetch.failRequest', {
          requestId: msg.params.requestId, errorReason: 'Failed',
        }).catch(() => {});
      } else {
        paused.push(msg.params.requestId);
      }
    } else if (msg.method === 'Network.responseReceived') {
      const r = msg.params.response;
      if (r.mimeType && r.mimeType.startsWith('image/')) imageResponses.push(r.url);
    } else if (msg.method === 'Network.loadingFailed') {
      failedRequests.push({
        error: msg.params.errorText,
        blocked: msg.params.blockedReason ?? '',
      });
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  if (pauseImages || failThumbs) {
    await send('Fetch.enable', {
      patterns: [{
        urlPattern: pauseImages ? '*images/*' : '*images/thumbs/*',
        requestStage: 'Request',
      }],
    });
  }
  await send('Page.navigate', { url });
  await sleep(2600);
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };
  const screenshot = async (file) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log('wrote', file);
  };
  const release = async () => {
    const ids = paused.splice(0);
    for (const requestId of ids) {
      try { await send('Fetch.continueRequest', { requestId }); } catch { /* 已过期 */ }
    }
    await send('Fetch.disable');
  };
  return { send, evaluate, screenshot, release, paused, imageResponses, failedRequests, ws };
}

/** 原图体积索引：缩略图文件名 -> 同 stem 的原图字节数。 */
const originalSizes = new Map();
for (const dir of ['cg', 'characters', 'sweet', 'sweet-cg']) {
  const root = path.join(ROOT, 'public', 'images', dir);
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(png|jpe?g|webp)$/i.test(e.name)) {
        originalSizes.set(e.name.replace(/\.[^.]+$/, ''), fs.statSync(p).size);
      }
    }
  };
  walk(root);
}

async function main() {
  // ---------- 第一段：暂停图片请求，验证骨架占位 ----------
  const slow = await connect(PAGE, { pauseImages: true });
  await slow.evaluate(`(() => { localStorage.removeItem('sweet.cg.v1'); return 1; })()`);

  const pendingState = await slow.evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-cg-card]')];
    const first = cards[0]?.querySelector('img');
    const sk = cards[0]?.querySelector('[data-image-skeleton]');
    return {
      cards: cards.length,
      skeletons: document.querySelectorAll('[data-cg-card] [data-image-skeleton]').length,
      state: first?.getAttribute('data-image-state') ?? '',
      src: first?.getAttribute('src') ?? '',
      dataSrc: first?.getAttribute('data-image-src') ?? '',
      shimmer: !!sk?.querySelector('.image-shimmer'),
      box: sk ? { w: Math.round(sk.getBoundingClientRect().width),
                  h: Math.round(sk.getBoundingClientRect().height) } : null,
      cardBox: cards[0] ? { w: Math.round(cards[0].getBoundingClientRect().width),
                            h: Math.round(cards[0].querySelector('[data-cg-open]').getBoundingClientRect().height) } : null,
    };
  })()`);
  check('慢链路下卡片先渲染占位骨架，不是一片空白',
    pendingState.cards > 0 && pendingState.skeletons > 0 && pendingState.state === 'loading',
    JSON.stringify(pendingState));
  check('骨架带扫光，且铺满图片区域（不塌陷）',
    pendingState.shimmer && pendingState.box?.w > 100 && pendingState.box?.h > 80 &&
    Math.abs(pendingState.box.w - pendingState.cardBox.w) <= 2,
    JSON.stringify({ box: pendingState.box, cardBox: pendingState.cardBox }));
  check('卡片请求的是缩略图而不是原图',
    pendingState.dataSrc.includes('images/thumbs/') && pendingState.dataSrc.endsWith('.webp'),
    pendingState.dataSrc);
  if (shot) await slow.screenshot(shot);

  await slow.release();
  await sleep(1800);
  const loadedState = await slow.evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-cg-card]')];
    const imgs = cards.map(c => c.querySelector('img')).filter(Boolean);
    const skeletons = [...document.querySelectorAll('[data-cg-card] [data-image-skeleton]')];
    return {
      skeletons: skeletons.length,
      skeletonsOnLoaded: cards.filter(c => c.querySelector('img[data-image-state="loaded"]') &&
        c.querySelector('[data-image-skeleton]')).length,
      skeletonsInViewport: skeletons.filter(s => {
        const r = s.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight;
      }).length,
      loaded: imgs.filter(i => i.getAttribute('data-image-state') === 'loaded').length,
      broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
      thumbs: imgs.filter(i => (i.getAttribute('data-image-src') ?? '').includes('images/thumbs/')).length,
      total: imgs.length,
      firstNatural: imgs[0]?.naturalWidth ?? 0,
    };
  })()`);
  check('图片到齐后视口内骨架收起，已加载的卡片不再留骨架',
    loadedState.skeletonsOnLoaded === 0 && loadedState.skeletonsInViewport === 0 &&
    loadedState.loaded > 0,
    JSON.stringify(loadedState));
  check('可见卡片全部加载成功且没有破图',
    loadedState.firstNatural > 0 && loadedState.broken === 0 && loadedState.loaded >= 3,
    JSON.stringify(loadedState));
  check('每张卡片都用缩略图', loadedState.thumbs === loadedState.total && loadedState.total > 0,
    JSON.stringify(loadedState));

  // 首屏实际下载的图片体积，与「直接下原图」对比。
  const urls = [...new Set(slow.imageResponses)].filter((u) => u.includes('/images/'));
  let thumbBytes = 0;
  let originalBytes = 0;
  for (const u of urls) {
    const rel = decodeURIComponent(u.split('/images/')[1] ?? '');
    if (!rel || rel.includes('favicon') || rel.includes('logo.png') && !rel.includes('thumbs')) continue;
    const file = path.join(ROOT, 'public', 'images', rel.split('?')[0]);
    if (!fs.existsSync(file)) continue;
    thumbBytes += fs.statSync(file).size;
    const stem = path.basename(file).replace(/\.[^.]+$/, '');
    const orig = originalSizes.get(stem);
    if (orig) originalBytes += orig;
  }
  check('首屏图片实际体积明显小于原图方案',
    thumbBytes > 0 && thumbBytes * 2 < originalBytes,
    `缩略图 ${Math.round(thumbBytes / 1024)} KB / 原图 ${Math.round(originalBytes / 1024)} KB，共 ${urls.length} 个请求`);

  // 灯箱：先给已缓存的缩略图，原图到位后叠上来。
  // object-contain 下「元素盒」是整块舞台，用户看到的其实是按宽高比缩放后的
  // 内容矩形；两层图的这个矩形必须一模一样，否则会出现「先小后大」的跳变。
  const LIGHTBOX_METRICS = `(() => {
    const measure = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const nw = el.naturalWidth, nh = el.naturalHeight;
      const scale = nw && nh ? Math.min(r.width / nw, r.height / nh) : 0;
      const w = nw * scale, h = nh * scale;
      return {
        boxW: Math.round(r.width), boxH: Math.round(r.height),
        w: Math.round(w), h: Math.round(h),
        left: Math.round(r.left + (r.width - w) / 2),
        top: Math.round(r.top + (r.height - h) / 2),
        naturalW: nw,
      };
    };
    const preview = measure(document.querySelector('[data-cg-lightbox-image]'));
    const full = measure(document.querySelector('[data-cg-lightbox-full]'));
    const stage = document.querySelector('[data-cg-lightbox-image]')?.parentElement;
    const sr = stage?.getBoundingClientRect();
    return { preview, full, stage: sr ? {
      w: Math.round(sr.width), h: Math.round(sr.height),
    } : null };
  })()`;
  await slow.evaluate(`document.querySelector('[data-cg-open]')?.click(); 1`);
  await sleep(350);
  const early = await slow.evaluate(`(() => ({
    box: !!document.querySelector('[data-cg-lightbox]'),
    preview: !!document.querySelector('[data-cg-lightbox-image]'),
    previewSrc: document.querySelector('[data-cg-lightbox-image]')?.getAttribute('src') ?? '',
    full: !!document.querySelector('[data-cg-lightbox-full]'),
  }))()`);
  check('点开大图立刻有一张可看的图（缩略图先顶上）',
    early.box && early.preview && early.previewSrc.includes('images/thumbs/'),
    JSON.stringify(early));
  const earlyMetrics = await slow.evaluate(LIGHTBOX_METRICS);
  check('预览图一上来就铺满舞台，按最终尺寸显示而不是它自己的小尺寸',
    earlyMetrics.preview && earlyMetrics.stage &&
    Math.abs(earlyMetrics.preview.boxW - earlyMetrics.stage.w) <= 1 &&
    Math.abs(earlyMetrics.preview.boxH - earlyMetrics.stage.h) <= 1 &&
    earlyMetrics.preview.w > 0,
    JSON.stringify(earlyMetrics));
  await sleep(1600);
  const full = await slow.evaluate(`(() => {
    const f = document.querySelector('[data-cg-lightbox-full]');
    const p = document.querySelector('[data-cg-lightbox-image]');
    return { hasFull: !!f, src: f?.getAttribute('src') ?? '', fullW: f?.naturalWidth ?? 0,
             previewW: p?.naturalWidth ?? 0 };
  })()`);
  check('原图加载完后叠上来，分辨率更高',
    full.hasFull && !full.src.includes('thumbs/') && full.fullW > full.previewW,
    JSON.stringify(full));
  const fullMetrics = await slow.evaluate(LIGHTBOX_METRICS);
  check('原图与预览图的显示矩形完全一致，切换时不会突然放大',
    earlyMetrics.preview && fullMetrics.full &&
    Math.abs(earlyMetrics.preview.w - fullMetrics.full.w) <= 1 &&
    Math.abs(earlyMetrics.preview.h - fullMetrics.full.h) <= 1 &&
    Math.abs(earlyMetrics.preview.left - fullMetrics.full.left) <= 1 &&
    Math.abs(earlyMetrics.preview.top - fullMetrics.full.top) <= 1,
    JSON.stringify({ preview: earlyMetrics.preview, full: fullMetrics.full }));

  // 图片元素铺满舞台后，点黑底关闭要按内容矩形判断，别把「点图」也当成关闭。
  await slow.evaluate(`(() => { const s = document.querySelector('[data-cg-lightbox-image]')?.parentElement;
    const r = s.getBoundingClientRect();
    s.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2 })); return 1; })()`);
  await sleep(150);
  const stayedOnImage = await slow.evaluate(`!!document.querySelector('[data-cg-lightbox]')`);
  if (stayedOnImage) {
    await slow.evaluate(`(() => { const s = document.querySelector('[data-cg-lightbox-image]')?.parentElement;
      const r = s.getBoundingClientRect();
      s.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 4,
        clientY: r.top + 4 })); return 1; })()`);
    await sleep(150);
  }
  const closedOnBackdrop = await slow.evaluate(`!document.querySelector('[data-cg-lightbox]')`);
  check('点图片不关闭、点图片外的黑底仍可关闭灯箱',
    stayedOnImage && closedOnBackdrop,
    JSON.stringify({ stayedOnImage, closedOnBackdrop }));
  slow.ws.close();

  // ---------- 第二段：缩略图全部不可用时自动退回原图 ----------
  const fallback = await connect(PAGE, { failThumbs: true });
  const fb = await fallback.evaluate(`(() => {
    const imgs = [...document.querySelectorAll('[data-cg-card] img')];
    return {
      total: imgs.length,
      // 视口外的 lazy 图还没发请求，本来就不会回退；只统计真正请求过的。
      attempted: imgs.filter(i => i.complete).length,
      original: imgs.filter(i => i.complete &&
        !(i.getAttribute('data-image-src') ?? '').includes('thumbs')).length,
      loaded: imgs.filter(i => i.getAttribute('data-image-state') === 'loaded').length,
      broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
      samples: imgs.slice(0, 2).map(i => ({
        src: i.getAttribute('src'), dataSrc: i.getAttribute('data-image-src'),
        state: i.getAttribute('data-image-state'), complete: i.complete, w: i.naturalWidth,
      })),
    };
  })()`);
  console.log('   (缩略图失败请求数:', fallback.failedRequests.length, ')');
  check('缩略图请求失败时自动退回原图，图片不会全废',
    fb.attempted > 0 && fb.original === fb.attempted &&
    fb.loaded === fb.attempted && fb.broken === 0,
    JSON.stringify(fb));
  fallback.ws.close();

  // ---------- 第三段：明星志愿3 也走同一套缩略图 / 骨架 ----------
  const mainCg = await connect(MAIN_CG, { pauseImages: true });
  const mainState = await mainCg.evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-cg-card]')];
    const imgs = cards.map(c => c.querySelector('img')).filter(Boolean);
    return {
      cards: cards.length,
      skeletons: document.querySelectorAll('[data-cg-card] [data-image-skeleton]').length,
      thumbs: imgs.filter(i => (i.getAttribute('data-image-src') ?? '').includes('images/thumbs/')).length,
      total: imgs.length,
      raw: document.querySelectorAll('img:not([data-image-src])').length,
    };
  })()`);
  check('明星志愿3 CG 图鉴慢链路有骨架，卡片全部用缩略图',
    mainState.cards > 0 && mainState.skeletons > 0 &&
    mainState.thumbs === mainState.total && mainState.raw === 0,
    JSON.stringify(mainState));
  await mainCg.release();
  const mainRawRequests = mainCg.imageResponses.filter(
    (u) => /\/images\//.test(u) && !u.includes('/images/thumbs/'),
  );
  check('明星志愿3 首屏不发 CG 原图请求', mainRawRequests.length === 0,
    mainRawRequests.slice(0, 3).join(', '));
  // 灯箱是共用组件，但两个站的 CG 图源尺寸不同，尺寸一致性要各验一次。
  await sleep(900);
  await mainCg.evaluate(`document.querySelector('[data-cg-open]')?.click(); 1`);
  await sleep(1500);
  const mainLightbox = await mainCg.evaluate(LIGHTBOX_METRICS);
  check('明星志愿3 灯箱同样是尺寸不变、只由糊变清晰',
    mainLightbox.preview && mainLightbox.full &&
    Math.abs(mainLightbox.preview.w - mainLightbox.full.w) <= 1 &&
    Math.abs(mainLightbox.preview.h - mainLightbox.full.h) <= 1 &&
    Math.abs(mainLightbox.preview.left - mainLightbox.full.left) <= 1 &&
    Math.abs(mainLightbox.preview.top - mainLightbox.full.top) <= 1,
    JSON.stringify(mainLightbox));
  mainCg.ws.close();

  const mainGuide = await connect(MAIN_GUIDE);
  const guideState = await mainGuide.evaluate(`(() => {
    const imgs = [...document.querySelectorAll('img')];
    const cover = imgs.find(i => (i.getAttribute('data-image-src') ?? '').includes('-cover'));
    return {
      total: imgs.length,
      raw: document.querySelectorAll('img:not([data-image-src])').length,
      cover: cover?.getAttribute('data-image-src') ?? '',
      thumbs: imgs.filter(i => (i.getAttribute('data-image-src') ?? '').includes('images/thumbs/')).length,
      broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
    };
  })()`);
  check('明星志愿3 攻略页的封面与头像也走缩略图',
    guideState.total > 0 && guideState.raw === 0 &&
    guideState.cover.startsWith('images/thumbs/characters/') &&
    guideState.cover.endsWith('-cover.webp') &&
    guideState.thumbs >= guideState.total - 1 && guideState.broken === 0,
    JSON.stringify(guideState));
  mainGuide.ws.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('failed:', failed.map((r) => r.label).join(' | '));
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
