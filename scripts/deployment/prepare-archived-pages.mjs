import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeOutputDirectory } from './profiles.mjs';

const REPOSITORY = 'ColmapView/Colmapview.github.io';
const GOOGLE_RESOURCE = /(?:googletagmanager|google-analytics)\.com|fonts\.(?:googleapis|gstatic)\.com|\bgtag\s*\(/i;
const INITIALIZER = /^\s*window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\];\s*function gtag\(\)\s*\{\s*dataLayer\.push\(arguments\);?\s*\}\s*gtag\(['"]js['"],\s*new Date\(\)\);\s*gtag\(['"]config['"],\s*['"]G-7K5H83SEMY['"]\);\s*$/;

/** Hosted archive privacy patch; original release tags and viewer bundles stay intact. */
export function archivedPage(html) {
  const clean = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (block, attributes, body) => {
    if (/\bsrc\s*=\s*["']https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-7K5H83SEMY["']/i.test(attributes)) return '';
    if (INITIALIZER.test(body)) return '';
    return block;
  }).replace(/<link\b[^>]*>/gi, block =>
    /\bhref\s*=\s*["']https:\/\/fonts\.(?:googleapis|gstatic)\.com(?:\/|["'])/i.test(block) ? '' : block);
  // Never publish an archive we do not recognize or silently leave a Google request behind.
  if (GOOGLE_RESOURCE.test(clean)) throw new Error('Unrecognized archived Google integration. Review before publishing.');
  if (clean === html) return html;
  if (!/<\/head>/i.test(clean)) throw new Error('Archived page has no head.');
  return clean.replace(/<\/head>/i, '<meta name="colmapview-hosted-privacy-update" content="2026-10-24"></head>');
}

async function boundedText(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body) throw new Error(`Archive preparation failed: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 128 * 1024) throw new Error('Archive metadata or page exceeds 128 KiB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function prepareArchivedPages(output) {
  const ref = JSON.parse(await boundedText(`https://api.github.com/repos/${REPOSITORY}/git/ref/heads/gh-pages`));
  const commit = ref.object?.sha;
  if (!/^[a-f0-9]{40}$/.test(commit) || ref.object.type !== 'commit') throw new Error('Invalid archive commit.');
  const root = JSON.parse(await boundedText(`https://api.github.com/repos/${REPOSITORY}/git/trees/${commit}`));
  if (root.truncated || !Array.isArray(root.tree)) throw new Error('Incomplete archive tree.');
  const versions = root.tree.filter(entry => entry.type === 'tree' && /^v\d+\.\d+\.\d+$/.test(entry.path)).map(entry => entry.path);
  let patched = 0;
  for (let start = 0; start < versions.length; start += 6) {
    await Promise.all(versions.slice(start, start + 6).map(async version => {
      const html = await boundedText(`https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${version}/index.html`);
      const clean = archivedPage(html);
      // Older Fontsource builds use these same OFL families. Include their notices
      // with every hosted archive, including versions predating the policy pages.
      const fonts = path.join(output, version, 'fonts');
      mkdirSync(fonts, { recursive: true });
      for (const name of ['OFL.txt', 'JetBrainsMono-OFL.txt']) {
        copyFileSync(new URL(`../../public/fonts/${name}`, import.meta.url), path.join(fonts, name));
      }
      if (clean === html) return;
      const directory = path.join(output, version);
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, 'index.html'), clean);
      patched++;
    }));
  }
  console.log(`Checked ${versions.length} hosted release pages; prepared ${patched} privacy patches from ${commit}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareArchivedPages(safeOutputDirectory(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || '.tmp/deployment/root'));
}
