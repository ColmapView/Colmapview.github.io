import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.join(process.cwd(), 'src');
const COMPONENTS_ROOT = path.join(SRC_ROOT, 'components');
// One walk of src/ and at most one read per file, shared by all three tests
// below. The suite runs alongside the other whole-tree scans (classContract,
// sparkImportBoundary), and repeating that I/O per test was what pushed this
// file past its budget on a loaded machine — the timeout kept widening
// (15s → 45s) to absorb work the tests were repeating, not work they needed.
// Cached, the whole file costs one walk, 633 unique reads (down from 988) and
// 55 stats: ~80ms standalone, and the residual under full-suite contention is
// disk latency on those reads, not repeated work. 15s is a flake guard against
// that latency, not a performance assertion.
const STORE_BOUNDARY_SCAN_TIMEOUT_MS = 15_000;
const STORE_HOOK_CALL_PATTERN = /\buse[A-Z][A-Za-z0-9]*Store\s*\(/g;
const ZUSTAND_CREATE_IMPORT_PATTERN = /import\s*\{[^}]*\bcreate\b[^}]*\}\s*from\s*['"]zustand['"]/;
// Stores outside src/store also escape the use*Store facade check through their names.
const DOCUMENTED_STORES_OUTSIDE_STORE_DIR = new Set([
  'src/theme/uiTheme.ts', // Applied before React mounts; predates this rule.
]);
const DOCUMENTED_STORE_BOUNDARY_CALLERS = new Set([
  'src/dataset/index.ts',
  'src/hooks/useAlignmentMode.ts',
  'src/hooks/useFileDropzone.ts',
  'src/hooks/useHotkeyScope.ts',
  'src/hooks/useImageSelection.ts',
  'src/hooks/useUrlLoader.ts',
  'src/hooks/useUrlState.ts',
  'src/nodes/hooks/useAxesNode.ts',
  'src/nodes/hooks/useCamerasNode.ts',
  'src/nodes/hooks/useGizmoNode.ts',
  'src/nodes/hooks/useGridNode.ts',
  'src/nodes/hooks/useMatchesNode.ts',
  'src/nodes/hooks/useNavigationNode.ts',
  'src/nodes/hooks/usePointsNode.ts',
  'src/nodes/hooks/useRigNode.ts',
  'src/nodes/hooks/useSelectionNode.ts',
]);

function isProductionSourceFile(filePath: string): boolean {
  return (
    (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) &&
    !filePath.endsWith('.test.ts') &&
    !filePath.endsWith('.test.tsx') &&
    !filePath.endsWith('.spec.ts') &&
    !filePath.endsWith('.spec.tsx')
  );
}

function isStoreFacadeFile(relativePath: string): boolean {
  return relativePath.includes('StoreFacade') || relativePath.includes('modalErrorBoundaryStoreFacade');
}

function isStoreModule(relativePath: string): boolean {
  return relativePath.startsWith('src/store/');
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }
    return isProductionSourceFile(entryPath) ? [entryPath] : [];
  }));
  return files.flat();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const sourceFilesPromise = collectSourceFiles(SRC_ROOT);
const componentFilesPromise = sourceFilesPromise.then((files) =>
  files.filter((file) => file.startsWith(COMPONENTS_ROOT + path.sep))
);

// Tests 1 and 2 scan overlapping file sets, so memoise the read: every file is
// read from disk at most once no matter how many tests inspect it.
const sourceTextCache = new Map<string, Promise<string>>();

function readSourceFile(filePath: string): Promise<string> {
  let pending = sourceTextCache.get(filePath);
  if (!pending) {
    pending = readFile(filePath, 'utf8');
    sourceTextCache.set(filePath, pending);
  }
  return pending;
}

describe('component store boundaries', () => {
  it('keeps production component store hooks behind facade modules', async () => {
    const files = await componentFilesPromise;
    const violations: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');
      if (isStoreFacadeFile(relativePath)) continue;

      const source = await readSourceFile(file);
      const matches = Array.from(source.matchAll(STORE_HOOK_CALL_PATTERN))
        .map((match) => match[0].replace(/\s*\($/, ''))
        .filter((hookName) => hookName !== 'useSyncExternalStore');

      for (const hookName of matches) {
        violations.push(`${relativePath}: ${hookName}`);
      }
    }

    expect(violations).toEqual([]);
  }, STORE_BOUNDARY_SCAN_TIMEOUT_MS);

  it('keeps non-component store hook calls in documented boundary modules', async () => {
    const files = await sourceFilesPromise;
    const violations: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');
      if (
        isStoreModule(relativePath) ||
        isStoreFacadeFile(relativePath) ||
        DOCUMENTED_STORE_BOUNDARY_CALLERS.has(relativePath)
      ) {
        continue;
      }

      const source = await readSourceFile(file);
      const matches = Array.from(source.matchAll(STORE_HOOK_CALL_PATTERN))
        .map((match) => match[0].replace(/\s*\($/, ''))
        .filter((hookName) => hookName !== 'useSyncExternalStore');

      for (const hookName of matches) {
        violations.push(`${relativePath}: ${hookName}`);
      }
    }

    expect(violations).toEqual([]);
  }, STORE_BOUNDARY_SCAN_TIMEOUT_MS);

  it('creates Zustand stores only under src/store', async () => {
    const files = await sourceFilesPromise;
    const violations: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');
      if (isStoreModule(relativePath) || DOCUMENTED_STORES_OUTSIDE_STORE_DIR.has(relativePath)) continue;
      if (ZUSTAND_CREATE_IMPORT_PATTERN.test(await readSourceFile(file))) violations.push(relativePath);
    }

    expect(violations).toEqual([]);
  }, STORE_BOUNDARY_SCAN_TIMEOUT_MS);

  it('keeps store facades covered by colocated tests', async () => {
    const files = await componentFilesPromise;
    // Rename src/components and every list below goes empty, which would make
    // this assertion pass by scanning nothing. Prove the scan found the tree.
    expect(files.length).toBeGreaterThan(0);
    const facadeFiles = files
      .map((file) => path.relative(process.cwd(), file).replace(/\\/g, '/'))
      .filter(isStoreFacadeFile);
    const testChecks = await Promise.all(facadeFiles.map(async (relativePath) => ({
      relativePath,
      hasTest: await fileExists(path.join(process.cwd(), relativePath.replace(/\.ts$/, '.test.ts'))),
    })));
    const missingTests = testChecks
      .filter((check) => !check.hasTest)
      .map((check) => check.relativePath);

    expect(missingTests).toEqual([]);
  });
});
