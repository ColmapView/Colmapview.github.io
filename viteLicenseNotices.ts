import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface LicenseEntry { name: string; version: string; identifier?: string; text?: string; source?: string }
interface Supplement extends LicenseEntry { file: string; packageRoot?: string; extra?: boolean }
const INVENTORY = 'licenses/dependencies.json';

/** npm tarballs sometimes omit their license file; keep reviewed upstream copies. */
export function completeLicenseEntries(entries: LicenseEntry[], root: string): LicenseEntry[] {
  const supplements: Supplement[] = JSON.parse(readFileSync(path.join(root, 'public/licenses/supplements.json'), 'utf8'));
  const completed = new Map(entries.map(entry => [`${entry.name}@${entry.version}`, { ...entry }]));
  for (const supplement of supplements) {
    const pkg = JSON.parse(readFileSync(path.join(root, supplement.packageRoot ?? `node_modules/${supplement.name}`, 'package.json'), 'utf8'));
    if (pkg.version !== supplement.version) throw new Error(`Review license supplement for ${supplement.name}@${pkg.version}.`);
    const key = `${supplement.name}@${supplement.version}`;
    const entry = completed.get(key);
    if (!entry && !supplement.extra) continue;
    completed.set(key, { name: supplement.name, version: supplement.version,
      identifier: entry?.identifier ?? pkg.license, source: supplement.source,
      text: entry?.text?.trim() || readFileSync(path.join(root, 'public/licenses', supplement.file), 'utf8').trim() });
  }
  const result = [...completed.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
  for (const entry of result) {
    if (!entry.text?.trim()) throw new Error(`No license text for ${entry.name}@${entry.version}. Add a reviewed upstream supplement.`);
  }
  return result;
}

/** Complete Vite's inventory, including separately copied archive/vendor code. */
export function licenseNotices(root: string): Plugin {
  return {
    name: 'complete-license-notices',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const inventory = bundle[INVENTORY];
        if (!inventory || inventory.type !== 'asset') throw new Error('Vite dependency-license inventory is missing.');
        const source = typeof inventory.source === 'string' ? inventory.source : new TextDecoder().decode(inventory.source);
        const entries = completeLicenseEntries(JSON.parse(source), root);
        const text = '# Third-party licenses\n\nBundled dependencies and separately copied archive/vendor code. '
          + 'See NOTICE for native decoder source and build links; fonts retain their separate OFL notices.\n\n'
          + entries.map(entry => `## ${entry.name} ${entry.version} (${entry.identifier ?? 'see license'})\n\n`
            + (entry.source ? `Notice source: ${entry.source}\n\n` : '') + entry.text + '\n').join('\n');
        delete bundle[INVENTORY];
        this.emitFile({ type: 'asset', fileName: 'licenses/dependencies.md', source: text });
      },
    },
  };
}
