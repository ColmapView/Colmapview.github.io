import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = resolve(process.env.PERF_DIST || 'dist');
if (!existsSync(resolve(root, 'index.html'))) throw new Error(`Production build missing: ${root}`);
const fixtures = resolve('.tmp/performance/fixtures');
const metrics = { active: 0, peak: 0, requests: [], bytes: 0 };
const attempts = new Map();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAcSURBVDhPY/hPIWBAFyAVjBowagAIjBowGAwAAF14/C6S1TgxAAAAAElFTkSuQmCC', 'base64');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png' };
function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
  res.setHeader('Timing-Allow-Origin', '*');
  if (url.pathname === '/__metrics') { res.end(JSON.stringify(metrics)); return; }
  if (url.pathname === '/manifest.json') {
    const fixture = url.searchParams.get('fixture') || 'small';
    if (!/^[a-z]+$/.test(fixture)) { res.writeHead(400).end(); return; }
    const metadata = JSON.parse(readFileSync(resolve(fixtures, fixture, 'metadata.json')));
    const namespace = url.searchParams.get('namespace') || 'default';
    if (!/^[a-z0-9-]+$/.test(namespace)) { res.writeHead(400).end(); return; }
    const imageNameToPath = {};
    for (let i = 1; i <= metadata.imageCount; i++) {
      const name = `image-${String(i).padStart(5, '0')}.png`;
      const behavior = i === 3 ? 'limited' : i === 4 ? 'missing' : i === 5 ? 'disconnect' : 'ok';
      // Manifest overrides are relative paths, not absolute cross-origin URLs.
      imageNameToPath[name] = `media/${namespace}/${behavior}/${name}`;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ version: 1, name: 'Controlled performance fixture', baseUrl: 'http://127.0.0.1:4173/', files: { cameras: `fixtures/${fixture}/cameras.bin`, images: `fixtures/${fixture}/images.bin`, points3D: `fixtures/${fixture}/points3D.bin` }, imagesPath: `media/${namespace}/ok/`, masksPath: `media/${namespace}/masks/`, imageNameToPath }));
    return;
  }
  if (url.pathname.startsWith('/media/')) {
    const key = `${req.headers.host}${url.pathname}`;
    const attempt = (attempts.get(key) || 0) + 1;
    attempts.set(key, attempt);
    metrics.active++;
    metrics.peak = Math.max(metrics.peak, metrics.active);
    const entry = { key, attempt, start: Date.now(), end: null, status: 200 };
    metrics.requests.push(entry);
    res.once('close', () => { metrics.active--; entry.end = Date.now(); });
    if (url.pathname.includes('disconnect')) { req.socket.destroy(); return; }
    if (url.pathname.includes('missing')) entry.status = 404;
    if (url.pathname.includes('limited') && attempt <= 2) { entry.status = 429; res.setHeader('Retry-After', '1'); }
    res.writeHead(entry.status, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    // Send headers now: the slot must remain held during delayed body consumption.
    res.flushHeaders();
    const timer = setTimeout(() => { if (!res.destroyed) { metrics.bytes += png.length; res.end(png); } }, Number(url.searchParams.get('delay') || (url.pathname.includes('/slow-') ? 10000 : 100)));
    res.once('close', () => clearTimeout(timer));
    return;
  }
  const fixture = url.pathname.startsWith('/fixtures/');
  const base = fixture ? fixtures : root;
  let path = resolve(base, `.${decodeURIComponent(fixture ? url.pathname.slice(9) : url.pathname)}`);
  if (path !== base && !path.startsWith(base + sep)) { res.writeHead(403).end(); return; }
  if (!existsSync(path) || statSync(path).isDirectory()) path = fixture ? '' : resolve(root, 'index.html');
  if (!path) { res.writeHead(404).end(); return; }
  let body = readFileSync(path);
  res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (/\.(js|css|html|json)$/.test(path) && req.headers['accept-encoding']?.includes('gzip')) { body = gzipSync(body); res.setHeader('Content-Encoding', 'gzip'); }
  res.setHeader('Content-Length', body.length);
  res.end(body);
}
for (const port of [4173, 4174]) createServer(handler).listen(port, '127.0.0.1', () => console.log(`Performance origin http://127.0.0.1:${port}; ${root}`));
