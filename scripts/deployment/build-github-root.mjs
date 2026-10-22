import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { safeOutputDirectory } from './profiles.mjs';

const output = safeOutputDirectory(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || '.tmp/deployment/root');
mkdirSync(output, { recursive: true });
const redirect = readFileSync(new URL('./github-share-redirect.mjs', import.meta.url));
const revision = createHash('sha256').update(redirect).digest('hex').slice(0, 12);
writeFileSync(path.join(output, 'index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; base-uri 'none'"><noscript><meta http-equiv="refresh" content="0; url=/latest/"></noscript><link rel="canonical" href="/latest/"><title>ColmapView</title><script type="module" src="/share-redirect.js?v=${revision}"></script></head><body><p>Open <a href="/latest/">ColmapView</a>.</p></body></html>\n`);
writeFileSync(path.join(output, '404.html'), '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; base-uri \'none\'"><title>ColmapView</title><script type="module" src="/share-redirect.js"></script></head><body><h1>Page not found</h1><p>Open <a href="/latest/">ColmapView</a>.</p></body></html>\n');
writeFileSync(path.join(output, 'share-redirect.js'), redirect);
writeFileSync(path.join(output, '.nojekyll'), '');
console.log('Prepared GitHub root redirect and short share-link handler.');
