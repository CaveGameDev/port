// This service worker no longer unzips anything itself. The loader page
// (loader.html) streams the zip parts, extracts each file with fflate as it
// downloads, and writes every extracted file straight into Cache Storage
// under CACHE_NAME, keyed by its path relative to this SW's scope (i.e. no
// extra prefix — 'chunks/d1_canals_01.data', not 'app/chunks/...').
//
// This SW's only job is to intercept requests for known game asset paths and
// serve them out of that cache with the correct Content-Type. It does NOT
// import fflate and does NOT decompress anything — that already happened in
// the loader before the page ever navigated here.

const CACHE_NAME = 'ptal'; // MUST match CACHE_NAME used by loader.html when caching files
const SCOPE_PREFIX = self.registration.scope;

const EXACT_PATHS = new Set([
  'chunks/background1.data',
  'chunks/testchmb_a_00.data',
  'chunks/testchmb_a_01.data',
  'chunks/testchmb_a_02.data',
  'chunks/testchmb_a_03.data',
  'chunks/testchmb_a_04.data',
  'chunks/testchmb_a_05.data',
  'chunks/testchmb_a_06.data',
  'chunks/testchmb_a_07.data',
  'chunks/testchmb_a_08.data',
  'chunks/testchmb_a_09.data',
  'chunks/testchmb_a_10.data',
  'chunks/testchmb_a_11.data',
  'chunks/testchmb_a_13.data',
  'chunks/testchmb_a_14.data',
  'chunks/testchmb_a_15.data',
  'hl2_launcher.js',
  'hl2_launcher.wasm',
  'index.html',
  'libclient.so',
  'libdatacache.so',
  'libengine.so',
  'libfilesystem_stdio.so',
  'libGameUI.so',
  'libinputsystem.so',
  'liblauncher.so',
  'libmaterialsystem.so',
  'libscenefilecache.so',
  'libserver.so',
  'libServerBrowser.so',
  'libshaderapidx9.so',
  'libsoundemittersystem.so',
  'libstdshader_dx9.so',
  'libsteam_api.so',
  'libstudiorender.so',
  'libtier0.so',
  'libtogl.so',
  'libvaudio_minimp3.so',
  'libvgui2.so',
  'libvguimatsurface.so',
  'libvideo_services.so',
  'libvphysics.so',
  'libvstdlib.so',
  'libvtex_dll.so',
  'portal.svg',
  'sw.js'
]);

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function mimeFor(path) {
  const ext = path.split('.').pop().toLowerCase();
  const map = {
    html: 'text/html; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    mjs: 'application/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    wasm: 'application/wasm',
    data: 'application/octet-stream',
    so: 'application/octet-stream',
    txt: 'text/plain; charset=utf-8',
    css: 'text/css; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    webm: 'video/webm',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    bin: 'application/octet-stream',
  };
  return map[ext] || 'application/octet-stream';
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.href.startsWith(SCOPE_PREFIX)) {
    return;
  }

  const relativePath = url.href.substring(SCOPE_PREFIX.length);
  if (!EXACT_PATHS.has(relativePath)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(SCOPE_PREFIX + relativePath);

      if (!cached) {
        // Nothing in cache yet for this path — the loader hasn't finished
        // extracting it (or extraction failed for this file). Don't fall
        // through to the network: these paths don't exist as real server
        // routes, so a network fetch would just 404 and mask the real
        // problem. Surface it clearly instead.
        return new Response(
          `Asset not yet cached: ${relativePath}`,
          { status: 404 }
        );
      }

      const buf = await cached.arrayBuffer();
      return new Response(buf, {
        headers: {
          'Content-Type': mimeFor(relativePath),
          'Content-Length': String(buf.byteLength),
          // Required for SharedArrayBuffer / threaded WASM: the top-level
          // document needs these to become crossOriginIsolated. Harmless to
          // include on subresource responses too.
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'same-origin',
        },
      });
    })()
  );
});