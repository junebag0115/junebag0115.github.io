/* Served from the game root, never from the compiled assets directory. */
'use strict';
const VERSION = '20260910-offline-2';
const ROOT = new URL('../../', self.location.href);
const LAUNCH = new URL('assets/offline/play.html', ROOT);
const PREFIX = `queens-772e7c71-${encodeURIComponent(ROOT.pathname)}-`;
const META_CACHE = `${PREFIX}index`;
const RECORD_URL = new URL('__offline_record__', ROOT).href;
let saving = null;

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function ownURL(value, base = ROOT) {
  const url = new URL(value, base);
  url.hash = '';
  if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) {
    throw new Error('A required game file is outside this game’s offline area.');
  }
  if (/\/assets\/ui\//.test(url.pathname)) {
    throw new Error('An unexpected storefront file was requested.');
  }
  return url.href;
}

async function readRecord() {
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(RECORD_URL);
  return response ? response.json() : null;
}

async function savedState(seeds = []) {
  const record = await readRecord();
  if (!record || !record.cache.startsWith(PREFIX) || !Array.isArray(record.urls)) return { ready: false };
  if (!(await caches.has(record.cache))) return { ready: false };
  const cache = await caches.open(record.cache);
  const keys = new Set((await cache.keys()).map(request => request.url));
  const complete = record.urls.every(url => keys.has(url));
  const current = record.version === VERSION && seeds.every(url => keys.has(ownURL(url)));
  return { ready: complete && current, previous: complete, count: record.urls.length, savedAt: record.savedAt };
}

async function download(url) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 60000);
  try {
    const response = await fetch(url, { cache: 'reload', credentials: 'same-origin', signal: abort.signal });
    if (!response.ok || response.status === 206 || response.type === 'opaque') {
      throw new Error(`Could not save ${new URL(url).pathname.split('/').pop()} (${response.status}).`);
    }
    if (response.url && ownURL(response.url) !== url) {
      throw new Error('A game file redirected. Open the direct game link and try again.');
    }
    // Consume before clearing the timeout: interrupted bodies must never count as saved.
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    headers.delete('Content-Encoding');
    headers.delete('Transfer-Encoding');
    headers.set('Content-Length', String(body.byteLength));
    return new Response(body, { status: 200, headers });
  } finally { clearTimeout(timer); }
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = (match[2] ?? match[3] ?? match[4]).replace(/&amp;/g, '&');
  }
  return result;
}

function dependencies(text, url, kind) {
  const found = new Set();
  const add = (path, base = url) => {
    if (!path || /^(data:|blob:|#)/i.test(path)) return;
    found.add(ownURL(path, base));
  };
  if (kind === 'html') {
    if (/<base\b/i.test(text)) throw new Error('This game page uses an unsupported base address.');
    let modules = 0;
    for (const match of text.matchAll(/<(script|link|img|source)\b[^>]*>/gi)) {
      const tag = match[1].toLowerCase();
      const attr = attributes(match[0]);
      if (tag === 'script' && attr.src) {
        add(attr.src);
        if (attr.type === 'module') modules++;
      }
      if (tag === 'link' && /^(stylesheet|modulepreload|preload|manifest|icon|apple-touch-icon)$/.test(attr.rel || '')) add(attr.href);
      if ((tag === 'img' || tag === 'source') && attr.src) add(attr.src);
    }
    if (!modules) throw new Error('The game’s compiled entry could not be found. Open the direct game link.');
    for (const match of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      for (const dep of dependencies(match[1], url, 'css')) found.add(dep);
    }
    for (const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      for (const dep of dependencies(match[1], url, 'js')) found.add(dep);
    }
  } else if (kind === 'js') {
    // Static imports/re-exports and literal dynamic imports, including minified output.
    const imports = /\b(?:import|export)\s*(?:[^;'"`]*?\bfrom\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g;
    for (const match of text.matchAll(imports)) add(match[1] || match[2]);
    // Vite's generated preload dependency map can contain chunks that have not run yet.
    for (const match of text.matchAll(/(?:\.f\s*\|\|\s*\([^=]*=|__vite__mapDeps[^=]*=)\s*\[([^\]]*)\]/g)) {
      for (const item of match[1].matchAll(/["']([^"']+\.(?:m?js|css)(?:\?[^"']*)?)["']/g)) add(item[1]);
    }
    for (const match of text.matchAll(/new\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g)) add(match[1]);
  } else if (kind === 'css') {
    for (const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)|@import\s+["']([^"']+)["']/g)) {
      add(match[1] ?? match[2] ?? match[3] ?? match[4]);
    }
  }
  return [...found];
}

async function saveGame(seeds, progress) {
  const name = `${PREFIX}files-${VERSION}-${Date.now()}`;
  const cache = await caches.open(name);
  let committed = false;
  try {
    const manifestURL = ownURL('assets/offline/offline-assets.json');
    const manifestResponse = await download(manifestURL);
    const manifest = await manifestResponse.clone().json();
    if (manifest.version !== VERSION || !Array.isArray(manifest.assets) || !manifest.assets.length) {
      throw new Error('The offline file list is missing or out of date. Reload online and try again.');
    }
    await cache.put(manifestURL, manifestResponse);
    const queue = [];
    const queued = new Set([manifestURL]);
    const enqueue = value => {
      const url = ownURL(value);
      if (!queued.has(url)) { queued.add(url); queue.push(url); }
    };
    enqueue(ROOT.href);
    enqueue('assets/offline/manifest.webmanifest');
    manifest.assets.forEach(path => {
      if (typeof path !== 'string' || !path.startsWith('assets/')) throw new Error('Invalid offline file list.');
      enqueue(path);
    });
    seeds.forEach(enqueue);
    let completed = 1;
    let bytes = 0;
    // Sequential writes limit peak memory on iPad and give each file a clear failure.
    for (let index = 0; index < queue.length; index++) {
      const url = queue[index];
      progress({ type: 'progress', completed, total: queued.size, bytes });
      const response = await download(url);
      const mime = response.headers.get('content-type') || '';
      const pathname = new URL(url).pathname;
      let kind = url === ROOT.href || /\.html$/.test(pathname) ? 'html'
        : /\.m?js$/.test(pathname) ? 'js' : /\.css$/.test(pathname) ? 'css' : '';
      if (mime.includes('text/html') && kind !== 'html') throw new Error(`A required file was missing: ${pathname.split('/').pop()}.`);
      if (kind) {
        const text = await response.clone().text();
        for (const dependency of dependencies(text, url, kind)) enqueue(dependency);
      }
      const size = (await response.clone().arrayBuffer()).byteLength;
      if (!size) throw new Error(`A required file was empty: ${pathname.split('/').pop()}.`);
      bytes += size;
      await cache.put(url, response);
      completed++;
    }
    const entry = await cache.match(ROOT.href);
    if (!entry) throw new Error('The saved game page is missing.');
    const indexURL = ownURL('index.html');
    await cache.put(indexURL, entry.clone());
    queued.add(indexURL);
    const launchHTML = (await entry.clone().text()).replace(/<head([^>]*)>/i, '<head$1><base href="'+ROOT.href+'">');
    await cache.put(LAUNCH.href, new Response(launchHTML, {headers:{'Content-Type':'text/html; charset=utf-8'}}));
    queued.add(LAUNCH.href);
    const urls = [...queued];
    const keys = new Set((await cache.keys()).map(request => request.url));
    if (!urls.every(url => keys.has(url))) throw new Error('Storage did not retain every required game file.');
    const record = { version: VERSION, cache: name, urls, savedAt: Date.now(), bytes };
    const metadata = await caches.open(META_CACHE);
    await metadata.put(RECORD_URL, new Response(JSON.stringify(record), { headers: { 'Content-Type': 'application/json' } }));
    committed = true;
    // Only this game's snapshots are removed, and only after the new one is complete.
    for (const old of await caches.keys()) {
      if (old.startsWith(`${PREFIX}files-`) && old !== name) await caches.delete(old).catch(() => false);
    }
    progress({ type: 'complete', count: urls.length, bytes, savedAt: record.savedAt });
  } finally {
    if (!committed) await caches.delete(name).catch(() => false);
  }
}

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port || !event.source || !event.source.url) return;
  try { ownURL(event.source.url); } catch { return; }
  const message = event.data || {};
  const send = data => port.postMessage(data);
  const task = async () => {
    try {
      const seeds = Array.isArray(message.seeds) ? message.seeds.map(value => ownURL(value)) : [];
      if (message.type === 'status') send({ type: 'status', ...await savedState(seeds) });
      else if (message.type === 'save') {
        if (saving) throw new Error('An offline save is already running. Keep that game tab open until it finishes.');
        saving = saveGame(seeds, send);
        try { await saving; } finally { saving = null; }
      }
    } catch (error) {
      send({ type: 'error', message: error.name === 'QuotaExceededError'
        ? 'There is not enough device storage. Free some space, then try Save Offline again.'
        : error.name === 'AbortError' ? 'A download timed out. Stay online and try again.'
        : error.message || 'Offline storage is unavailable. Try Safari outside Private Browsing.' });
    }
  };
  event.waitUntil(task());
});

async function rangeResponse(request, response) {
  const range = request.headers.get('range');
  if (!range) return response;
  const bytes = await response.arrayBuffer();
  const size = bytes.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.delete('Content-Encoding');
  headers.delete('Transfer-Encoding');
  const invalid = () => {
    headers.set('Content-Range', `bytes */${size}`);
    headers.set('Content-Length', '0');
    return new Response(null, { status: 416, headers });
  };
  if (!match || (!match[1] && !match[2]) || !size) return invalid();
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return invalid();
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

async function serve(request) {
  let record;
  try { record = await readRecord(); } catch { return fetch(request); }
  if (!record || !record.cache.startsWith(`${PREFIX}files-`)) return fetch(request);
  const cache = await caches.open(record.cache);
  const url = new URL(request.url);
  const entry = url.pathname === ROOT.pathname || url.pathname === `${ROOT.pathname}index.html` || url.pathname === LAUNCH.pathname;
  // Online navigation gets the current release. Offline navigation ignores only
  // entry-page query strings, never arbitrary app routes or another game's URLs.
  if (request.mode === 'navigate' && entry) {
    try {
      const response = await fetch(request);
      if (response.ok) return response;
    } catch { /* Open the explicitly saved snapshot when offline. */ }
    return await cache.match(url.pathname === LAUNCH.pathname ? LAUNCH.href : ROOT.href) || Response.error();
  }
  const saved = await cache.match(request.url);
  if (saved) return rangeResponse(request, saved);
  return fetch(request);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  if (/\/assets\/ui\//.test(url.pathname) || url.pathname === new URL('assets/offline/sw.js', ROOT).pathname) return;
  event.respondWith(serve(event.request));
});
