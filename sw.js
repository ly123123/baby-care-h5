/* 宝宝成长记 · Service Worker
 * 版本：babycare-v1.4.0
 * ------------------------------------------------------------
 * install  ：预缓存全部静态资源（列表必须与实际文件一致）
 * activate ：清理旧的 babycare-* 缓存 + clients.claim 接管页面
 * fetch    ：同源 GET 走 cache-first，未命中再请求网络并回填缓存
 *            导航请求网络优先，失败回退 ./index.html（离线仍可打开）
 * message  ：{ type: 'SKIP_WAITING' } 让等待中的新版本立即激活
 * 说明     ：整套应用零外部请求，SW 只缓存本站同源资源。
 *            升级代码后请同步修改下方 VERSION（如 babycare-v1.0.1）。
 */
'use strict';

const VERSION = 'babycare-v1.4.0';
const CACHE_PREFIX = 'babycare-';
const OFFLINE_FALLBACK = './index.html';

/** 预缓存清单：与 SPEC 第 7 节严格一致，缺一个文件 install 就会失败 */
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/styles.css',
  './css/stats.css',
  './js/store.js',
  './js/ui.js',
  './js/app.js',
  './js/stats.js',
  './js/charts.js',
  './js/share.js',
  './js/paper-parse.js',
  './js/paper-ocr.js',
  './js/paper-import.js',
  './js/sync-ops.js',
  './js/sync.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.svg',
];

/* ---------------- install：预缓存 ---------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // addAll 是原子操作：任一资源 404 都会让整个预缓存失败（便于尽早发现问题）
      await cache.addAll(PRECACHE_URLS);
      // 新版本立即进入等待激活状态（页面如需提示更新，可用 message SKIP_WAITING）
      await self.skipWaiting();
    })()
  );
});

/* ---------------- activate：清旧缓存 + 接管 ---------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== VERSION)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

/* ---------------- fetch ---------------- */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // 只处理同源请求，跨域请求交还给浏览器
  if (url.origin !== self.location.origin) return;

  // 家庭共享 API（含 SSE 长连接）绝不能进缓存
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  event.respondWith(handleAsset(request));
});

/** 导航：网络优先，失败时回退到缓存的 index.html，保证离线可打开 */
async function handleNavigation(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
      return response;
    }
    throw new Error('HTTP ' + response.status);
  } catch {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(OFFLINE_FALLBACK)) ||
      (await cache.match('./'));
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>暂时无法打开</title>' +
        '<body style="font:16px/1.7 -apple-system,PingFang SC,sans-serif;color:#40342E;background:#FAF5EF;padding:40px">' +
        '<h1 style="font-size:20px">暂时无法打开</h1>' +
        '<p>当前处于离线状态，且缓存尚未就绪。请联网后重新打开一次。</p></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/** 静态资源：cache-first + 网络回填 */
async function handleAsset(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response('离线状态下该资源尚未缓存', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/* ---------------- message：SKIP_WAITING ---------------- */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data === 'SKIP_WAITING' || data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'GET_VERSION' && event.source && typeof event.source.postMessage === 'function') {
    event.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});
