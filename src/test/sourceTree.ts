import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Synchronous scans run at test collection time without transforming the source tree. */
export function listFiles(directory: string = path.resolve(process.cwd(), 'src')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  });
}

export function toRepoRelative(file: string): string {
  return path.relative(process.cwd(), file).replace(/\\/g, '/');
}

export function isTestSource(file: string): boolean {
  return file.includes('.test.') || file.includes('.spec.');
}

export function readProductionSources(files: readonly string[] = listFiles()) {
  return files.filter(file => /\.tsx?$/.test(file) && !isTestSource(file)).map(file => ({
    relativePath: toRepoRelative(file),
    source: readFileSync(file, 'utf8'),
  }));
}

/** Prose comments must not count as CSS references or runtime imports. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\w'"`\\])\/\/[^\n]*/g, '$1');
}
