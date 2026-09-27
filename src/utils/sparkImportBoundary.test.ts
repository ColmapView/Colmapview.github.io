import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Contract: the Spark splat renderer stays behind ONE cached dynamic import.
 *
 * `spark-vendor` is by far the largest thing this app can load — 5,061,892 B raw
 * / 1,788,440 B gzipped, roughly 70% of all emitted JS — and it contributes
 * 0 bytes to the landing page, which fetches 2,211,923 B across 8 requests
 * (entry 988 kB, three-vendor 1.07 MB, ui-vendor 15 kB, react-vendor 11 kB,
 * 46 kB CSS, 46 kB latin font subset, 32 kB logo). It is fetched only once a
 * splat file exists (Scene3D / SplatLayer / fileDropzoneWorkflow all gate their
 * preload on one), via `preloadSparkModule()` in src/utils/sparkSplatRuntime.ts.
 *
 * A single static value import anywhere in src/ hoists that 5 MB chunk into the
 * entry graph and more than doubles first paint, silently — nothing else in the
 * gate fails when it happens. This test pins the structure instead: only the
 * runtime module may name the package, and inside it the only runtime reference
 * may be the call-form `import('@sparkjsdev/spark')`.
 */

// Copied verbatim from src/theme/classContract.test.ts. Prose is not code: a doc
// comment explaining why Spark is lazy would otherwise read as a violation of
// the very rule it documents.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\w'"`\\])\/\/[^\n]*/g, '$1');
}

// Deliberately a synchronous fs walk, not `import.meta.glob(..., { eager: true })`:
// the eager glob makes Vite transform every file under src/ before the body can
// run (~40s), which starves the other fs-walking suites and produces timeouts
// across the run. Same idiom as theme/classContract.test.ts and
// components/componentStoreBoundary.test.ts.
const SRC_ROOT = resolve(__dirname, '..');
const SPARK_PACKAGE = '@sparkjsdev/spark';
const RUNTIME_MODULE_PATH = 'src/utils/sparkSplatRuntime.ts';
const SPARK_IMPORT_SCAN_TIMEOUT_MS = 15_000;

const SPARK_PRELOAD_ENTRYPOINT = 'preloadSparkModule';
const SPARK_PRELOAD_START_GATE = 'shouldStartSparkSplatRuntimePreload';

// Sites that name the preload entrypoint without being the gate that starts a
// download. Each is exempt for a stated reason, not for convenience.
const DOCUMENTED_NON_DOWNLOAD_PRELOAD_SITES = new Set([
  // Defines it.
  'src/utils/sparkSplatRuntime.ts',
  // Use-site, not a gate: reachable only once availability.spark is true, i.e.
  // the module already landed and the memo is warm.
  // Injectable seam: the gate is threaded in as deps.shouldPreloadSplatRuntime
  // by useFileDropzone.ts, which is the file that consults START.
  'src/hooks/fileDropzoneWorkflow.ts',
]);

// Test files are excluded at the walk: they name the package in mocks and in
// pinned literals, neither of which ships. That exclusion also covers this
// file's own source, which necessarily contains the specifier.
function isScannableSource(name: string): boolean {
  if (!name.endsWith('.ts') && !name.endsWith('.tsx')) return false;
  return !name.includes('.test.') && !name.includes('.spec.');
}

function collectSourceFiles(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(entryPath, out);
    } else if (isScannableSource(entry.name)) {
      out.push(entryPath);
    }
  }
  return out;
}

function toRepoRelative(filePath: string): string {
  return relative(process.cwd(), filePath).replace(/\\/g, '/');
}

// Statement-level imports of the package, in every form that survives to
// runtime:
//   import { SplatMesh } from '@sparkjsdev/spark'   — eager
//   import { type X } from '@sparkjsdev/spark'      — ALSO eager: tsconfig.app.json
//     sets verbatimModuleSyntax, so an inline `type` specifier still emits the
//     import statement. Only statement-level `import type … from` is erased,
//     which is why the lookahead keys on `type` immediately after `import`.
//   import '@sparkjsdev/spark'                      — eager (bare side effect)
// The call forms `import('@sparkjsdev/spark')` and `typeof import('…')` never
// match: `import` is not followed by whitespace there. `[^;]` stands in for a
// statement boundary, which holds because this codebase terminates statements
// with semicolons.
const EAGER_IMPORT_RE = new RegExp(
  String.raw`(?:^|\n)\s*import\s+(?!type\b)(?:[^;]*?from\s*)?['"]` +
    SPARK_PACKAGE.replace('/', String.raw`\/`) +
    String.raw`['"]`,
  'g'
);

describe('spark import boundary', () => {
  it('names the spark package in exactly one production module', () => {
    const violations: string[] = [];

    for (const file of collectSourceFiles(SRC_ROOT)) {
      const relativePath = toRepoRelative(file);
      if (relativePath === RUNTIME_MODULE_PATH) continue;

      // Cheap substring test before the comment strip. Stripping only ever
      // REMOVES occurrences, so a raw source without the specifier cannot gain
      // one — and this keeps two whole-file regexes off the ~800 files that
      // never mention Spark. Not a micro-optimisation: running stripComments
      // unconditionally made this walk contend with the sibling fs-walking
      // suite badly enough to push componentStoreBoundary.test.ts from 0.4s to
      // 13.4s against its 15s budget.
      const rawSource = readFileSync(file, 'utf8');
      if (!rawSource.includes(SPARK_PACKAGE)) continue;

      for (const line of stripComments(rawSource).split('\n')) {
        if (line.includes(SPARK_PACKAGE)) {
          violations.push(`${relativePath}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  }, SPARK_IMPORT_SCAN_TIMEOUT_MS);

  it('keeps the runtime module free of eager spark imports', () => {
    const source = stripComments(readFileSync(join(process.cwd(), RUNTIME_MODULE_PATH), 'utf8'));
    const eagerImports = [...source.matchAll(EAGER_IMPORT_RE)].map((match) =>
      match[0].trim().replace(/\s+/g, ' ')
    );

    expect(eagerImports).toEqual([]);
  });

  it('loads spark through the cached dynamic import', () => {
    // The inverse of the assertion above: deleting the dynamic import — or
    // demoting it to something eager — must fail here, not silently shrink what
    // the guard covers. The `SparkModule` type alias spells `typeof
    // import('@sparkjsdev/spark')`, which is erased at compile time and must not
    // satisfy this pin, so it is neutralised before the lookup.
    const source = stripComments(
      readFileSync(join(process.cwd(), RUNTIME_MODULE_PATH), 'utf8')
    ).replace(/typeof\s+import\s*\(/g, 'typeof ERASED_TYPE_IMPORT(');

    expect(source).toContain(`import('${SPARK_PACKAGE}')`);
  });

  // Gating contract for the download itself. Two policy predicates read almost
  // identically in English, and the SHORTER name is the wrong one to gate on:
  //   shouldPreloadSparkSplatRuntime      — NEED: will Spark be the renderer?
  //   shouldStartSparkSplatRuntimePreload — START: NEED, and no terminal
  //                                         failure has been recorded yet.
  // Only START refuses to re-attempt a download that already gave up.
  // preloadSparkModule drops its memoised promise on rejection, so a site that
  // gates on NEED re-fetches the 5 MB chunk and double-reports the failure —
  // shipped once and fixed on 2026-08-30. Nothing but this test stops the next
  // call site from reaching for the shorter name.
  it('gates every spark download on the START predicate, not NEED', () => {
    const violations: string[] = [];

    for (const file of collectSourceFiles(SRC_ROOT)) {
      const relativePath = toRepoRelative(file);
      if (DOCUMENTED_NON_DOWNLOAD_PRELOAD_SITES.has(relativePath)) continue;

      const source = stripComments(readFileSync(file, 'utf8'));
      // The call form only: an import or a type position does not start a
      // download.
      if (!source.includes(`${SPARK_PRELOAD_ENTRYPOINT}(`)) continue;
      // Call form on both sides: a leftover import of the gate satisfies a bare
      // mention without gating anything (verified — an earlier version of this
      // test passed against a site that had swapped the call to NEED and merely
      // kept the unused import).
      if (source.includes(`${SPARK_PRELOAD_START_GATE}(`)) continue;

      violations.push(relativePath);
    }

    expect(violations).toEqual([]);
  }, SPARK_IMPORT_SCAN_TIMEOUT_MS);
});
