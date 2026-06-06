import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.join(process.cwd(), 'src');
const COMPONENTS_ROOT = path.join(SRC_ROOT, 'components');
const STORE_BOUNDARY_SCAN_TIMEOUT_MS = 15_000;
const STORE_HOOK_CALL_PATTERN = /\buse[A-Z][A-Za-z0-9]*Store\s*\(/g;
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

describe('component store boundaries', () => {
  it('keeps production component store hooks behind facade modules', async () => {
    const files = await collectSourceFiles(COMPONENTS_ROOT);
    const violations: string[] = [];

    for (const file of files) {
      const relativePath = path.relative(process.cwd(), file).replace(/\\/g, '/');
      if (isStoreFacadeFile(relativePath)) continue;

      const source = await readFile(file, 'utf8');
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
    const files = await collectSourceFiles(SRC_ROOT);
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

      const source = await readFile(file, 'utf8');
      const matches = Array.from(source.matchAll(STORE_HOOK_CALL_PATTERN))
        .map((match) => match[0].replace(/\s*\($/, ''))
        .filter((hookName) => hookName !== 'useSyncExternalStore');

      for (const hookName of matches) {
        violations.push(`${relativePath}: ${hookName}`);
      }
    }

    expect(violations).toEqual([]);
  }, STORE_BOUNDARY_SCAN_TIMEOUT_MS);

  it('keeps store facades covered by colocated tests', async () => {
    const files = await collectSourceFiles(COMPONENTS_ROOT);
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
