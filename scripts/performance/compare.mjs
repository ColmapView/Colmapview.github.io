import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRun(name) {
  const dir = resolve('.tmp/performance/runs', name);
  return readdirSync(dir).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(resolve(dir, file))));
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted.at(-1), p95: sorted[Math.ceil(sorted.length * .95) - 1] };
}
const [beforeName, afterName] = process.argv.slice(2);
if (!beforeName || !afterName) throw new Error('Usage: node scripts/performance/compare.mjs baseline-run current-run');
const before = readRun(beforeName);
const after = readRun(afterName);
if (!before.length || !after.length) throw new Error('Both runs require samples');
for (const sample of [...before, ...after]) {
  if (sample.workerDiagnostic || sample.instrumentation?.trace || sample.instrumentation?.processMemory) {
    throw new Error('Instrumented diagnostic runs cannot be used for timing comparisons');
  }
  if (sample.scene.renderer !== before[0].scene.renderer
    || sample.environment?.browser !== before[0].environment?.browser
    || sample.environment?.dpr !== before[0].environment?.dpr
    || sample.environment?.cpu !== before[0].environment?.cpu
    || sample.environment?.os !== before[0].environment?.os
    || sample.environment?.headless !== before[0].environment?.headless
    || JSON.stringify(sample.environment?.viewport) !== JSON.stringify(before[0].environment?.viewport)) {
    throw new Error('Browser/renderer/viewport mismatch');
  }
  if (sample.fixture.fingerprint !== before[0].fixture.fingerprint || Boolean(sample.filtered) !== Boolean(before[0].filtered)
    || Boolean(sample.nativeFiles) !== Boolean(before[0].nativeFiles)
    || (sample.format || 'bin') !== (before[0].format || 'bin') || Boolean(sample.withRigs) !== Boolean(before[0].withRigs)) {
    throw new Error('Dataset/configuration mismatch');
  }
}
for (const group of [before, after]) {
  if (group.some(sample => sample.buildSha256 !== group[0].buildSha256)) throw new Error('Build changed within a timing group');
}
const extractors = {
  sceneReadinessProxyMs: rows => rows.map(row => row.scene.usefulSceneProxyMs),
  selectionSchedulingProxyMs: rows => rows.flatMap(row => row.selections),
  firstSelectionSchedulingProxyMs: rows => rows.map(row => row.selections[0]),
  laterSelectionSchedulingProxyMs: rows => rows.flatMap(row => row.selections.slice(1)),
  loadBlockingMs: rows => rows.map(row => row.scene.longTasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0)),
  loadLongTaskCount: rows => rows.map(row => row.scene.longTasks.length),
  coarseHeapAtReadinessBytes: rows => rows.map(row => row.scene.heapAtReady).filter(value => value !== null),
  coldStartupProxyMs: rows => rows.map(row => row.startup.find(entry => entry.cache === 'cold').readyProxyMs),
  coldCompressedJsBodyBytes: rows => rows.map(row => row.startup.find(entry => entry.cache === 'cold').js.reduce((sum, entry) => sum + entry.compressedBodyBytes, 0)),
};
const metrics = {};
for (const [name, extract] of Object.entries(extractors)) {
  const previous = stats(extract(before));
  const current = stats(extract(after));
  metrics[name] = { before: previous, after: current, medianChangePercent: previous.median ? (current.median / previous.median - 1) * 100 : null };
}
console.log(JSON.stringify({ beforeName, afterName, repetitions: [before.length, after.length],
  fixture: before[0].fixture, filtered: Boolean(before[0].filtered),
  renderer: [before[0].scene.renderer, after[0].scene.renderer],
  buildSha256: [before[0].buildSha256 ?? null, after[0].buildSha256 ?? null], metrics }, null, 2));
