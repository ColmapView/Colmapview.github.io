import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

/** Serve only this prepared artifact. Missing assets are real 404s, never an SPA fallback. */
export async function startArtifactServer(directory, base = '/') {
  const root = path.resolve(directory);
  const headerFile = await readFile(path.join(root, '_headers'), 'utf8').catch(() => '');
  const headers = headerFile.includes('Cross-Origin-Opener-Policy: same-origin-allow-popups') ? {
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups', 'Referrer-Policy': 'strict-origin',
  } : {};
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(base)) { response.writeHead(404); response.end(); return; }
      const relative = pathname.slice(base.length) || 'index.html';
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(`${root}${path.sep}`)) { response.writeHead(404); response.end(); return; }
      const body = await readFile(filename);
      response.writeHead(200, { ...headers, 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}
