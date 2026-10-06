import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

// Interpret the exact routes and global rule emitted by our artifact builder.
function parseHeaderRules(text) {
  const rules = [];
  let rule;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (line.startsWith('/')) {
      rule = { path: line.trim(), headers: {} };
      rules.push(rule);
    } else if (rule) {
      const separator = line.indexOf(':');
      if (separator > 0) rule.headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }
  }
  return rules;
}

/** Serve only this prepared artifact. Missing assets are real 404s, never an SPA fallback. */
export async function startArtifactServer(directory, base = '/') {
  const root = path.resolve(directory);
  const headerFile = await readFile(path.join(root, '_headers'), 'utf8').catch(() => '');
  const headerRules = parseHeaderRules(headerFile);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(base)) { response.writeHead(404); response.end(); return; }
      const relative = pathname.slice(base.length) || 'index.html';
      let filename = path.resolve(root, relative);
      if (!filename.startsWith(`${root}${path.sep}`)) { response.writeHead(404); response.end(); return; }
      let body;
      try { body = await readFile(filename); }
      catch (error) {
        // Pages serves the canonical extensionless URL for an uploaded HTML file.
        if (error.code !== 'ENOENT' || path.extname(filename)) throw error;
        filename += '.html';
        body = await readFile(filename);
      }
      const headers = { 'cache-control': 'no-store' };
      for (const rule of headerRules) {
        if (rule.path !== '/*' && rule.path !== pathname) continue;
        Object.assign(headers, rule.headers);
      }
      response.writeHead(200, { ...headers, 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' });
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}
