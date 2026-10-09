import { listFiles, readProductionSources, toRepoRelative } from '../test/sourceTree';
import { describe, expect, it } from 'vitest';

const HOOK_CALL_PATTERN = /\b(use[A-Z][A-Za-z0-9]*)\s*\(/g;
const STORE_EXPORT_PATTERN = /export\s+const\s+(use[A-Za-z0-9]+)\s*=\s*create\b/g;
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

function isStoreFacadeFile(relativePath: string): boolean {
  return relativePath.includes('StoreFacade') || relativePath.includes('modalErrorBoundaryStoreFacade');
}

function isStoreModule(relativePath: string): boolean {
  return relativePath.startsWith('src/store/');
}

// Walked and read once, while this file is collected: no per-test timeout applies there, and every
// check below then filters the same in-memory tree. Read inside the first test, the scan took 2.3 s
// of a quiet full run and hit its 15 s budget under parallel load, where a budget only turns a
// slow-but-correct scan into a failure.
const TREE_FILES = listFiles();
const TREE_PATHS = new Set(TREE_FILES.map(toRepoRelative));
const PRODUCTION_SOURCES = readProductionSources(TREE_FILES);
const COMPONENT_SOURCES = PRODUCTION_SOURCES.filter(({ relativePath }) => relativePath.startsWith('src/components/'));
// Every store under src/store counts by its exported name too, so one named without the Store suffix
// (useDrivePublicationStatus) cannot escape the checks below.
const STORE_HOOK_NAMES = new Set(PRODUCTION_SOURCES.filter(({ relativePath }) => isStoreModule(relativePath))
  .flatMap(({ source }) => Array.from(source.matchAll(STORE_EXPORT_PATTERN), (match) => match[1])));

function storeHookCalls(source: string): string[] {
  return Array.from(source.matchAll(HOOK_CALL_PATTERN), (match) => match[1])
    .filter((hookName) => hookName !== 'useSyncExternalStore' && (hookName.endsWith('Store') || STORE_HOOK_NAMES.has(hookName)));
}

describe('component store boundaries', () => {
  it('keeps production component store hooks behind facade modules', () => {
    // An empty name set would quietly fall back to the suffix rule alone.
    expect(STORE_HOOK_NAMES.has('useReconstructionStore')).toBe(true);
    const violations: string[] = [];

    for (const { relativePath, source } of COMPONENT_SOURCES) {
      if (isStoreFacadeFile(relativePath)) continue;

      const matches = storeHookCalls(source);

      for (const hookName of matches) {
        violations.push(`${relativePath}: ${hookName}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps non-component store hook calls in documented boundary modules', () => {
    const violations: string[] = [];

    for (const { relativePath, source } of PRODUCTION_SOURCES) {
      if (
        isStoreModule(relativePath) ||
        isStoreFacadeFile(relativePath) ||
        DOCUMENTED_STORE_BOUNDARY_CALLERS.has(relativePath)
      ) {
        continue;
      }

      const matches = storeHookCalls(source);

      for (const hookName of matches) {
        violations.push(`${relativePath}: ${hookName}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('creates Zustand stores only under src/store', () => {
    const violations: string[] = [];

    for (const { relativePath, source } of PRODUCTION_SOURCES) {
      if (isStoreModule(relativePath) || DOCUMENTED_STORES_OUTSIDE_STORE_DIR.has(relativePath)) continue;
      if (ZUSTAND_CREATE_IMPORT_PATTERN.test(source)) violations.push(relativePath);
    }

    expect(violations).toEqual([]);
  });

  it('keeps store facades covered by colocated tests', () => {
    // Rename src/components and every list below goes empty, which would make
    // this assertion pass by scanning nothing. Prove the scan found the tree.
    expect(COMPONENT_SOURCES.length).toBeGreaterThan(0);
    const missingTests = COMPONENT_SOURCES
      .map(({ relativePath }) => relativePath)
      .filter(isStoreFacadeFile)
      .filter((relativePath) => !TREE_PATHS.has(relativePath.replace(/\.ts$/, '.test.ts')));

    expect(missingTests).toEqual([]);
  });
});
