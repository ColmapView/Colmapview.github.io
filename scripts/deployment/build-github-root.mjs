import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { safeOutputDirectory } from './profiles.mjs';

const output = safeOutputDirectory(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || '.tmp/deployment/root');
mkdirSync(output, { recursive: true });
const redirect = readFileSync(new URL('./github-share-redirect.mjs', import.meta.url));
const revision = createHash('sha256').update(redirect).digest('hex').slice(0, 12);
const script = `<script type="module" src="/share-redirect.js?v=${revision}"></script>`;
function redirectPage(title, target) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; base-uri 'none'"><noscript><meta http-equiv="refresh" content="0; url=${target}"></noscript><link rel="canonical" href="${target}"><title>${title}</title>${script}</head><body><p>Open <a href="${target}">${title}</a>.</p></body></html>\n`;
}
writeFileSync(path.join(output, 'index.html'), redirectPage('ColmapView', '/latest/'));
writeFileSync(path.join(output, '404.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; base-uri 'none'"><title>ColmapView</title>${script}</head><body><h1>Page not found</h1><p>Open <a href="/latest/">ColmapView</a>.</p></body></html>\n`);
for (const directory of ['hub', 'hub/datasets']) {
  // Clear only the old generated redirects in a reused staging directory.
  // The release merges a separately verified Hub artifact after this root build.
  const old = path.join(output, directory, 'index.html');
  if (existsSync(old) && readFileSync(old, 'utf8').includes('src="/share-redirect.js?')) unlinkSync(old);
}
writeFileSync(path.join(output, 'share-redirect.js'), redirect);
writeFileSync(path.join(output, '.nojekyll'), '');
console.log('Prepared GitHub root and short share-link handler for verified Hub artifact merge.');
