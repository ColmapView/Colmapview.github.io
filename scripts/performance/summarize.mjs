import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = resolve('.tmp/performance/runs', process.argv[2]);
const rows = readdirSync(dir).filter(name => name.endsWith('.json')).map(name => JSON.parse(readFileSync(resolve(dir, name))));
const stats = values => {
  values.sort((a, b) => a - b);
  return { median: values[Math.floor(values.length / 2)], min: values[0], max: values.at(-1), p95: values[Math.ceil(values.length * .95) - 1] };
};
console.log(JSON.stringify({ repetitions: rows.length, environment: rows[0]?.environment, renderer: rows[0]?.scene.renderer,
  usefulSceneProxyMs: stats(rows.map(r => r.scene.usefulSceneProxyMs)),
  selectionSchedulingProxyMs: stats(rows.flatMap(r => r.selections)),
  rafIntervalMs: stats(rows.flatMap(r => r.frameIntervals)),
  loadLongTaskCount: stats(rows.map(r => r.scene.longTasks.length)),
  loadBlockingMs: stats(rows.map(r => r.scene.longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0))),
  heapAtReadyBytes: stats(rows.map(r => r.scene.heapAtReady).filter(v => v !== null)),
  startup: ['cold', 'warm'].map(cache => ({ cache,
    readyProxyMs: stats(rows.map(r => r.startup.find(s => s.cache === cache).readyProxyMs)),
    jsTransferredBytes: stats(rows.map(r => r.startup.find(s => s.cache === cache).js.reduce((sum, js) => sum + js.transferBytes, 0))),
    jsCompressedBodyBytes: stats(rows.map(r => r.startup.find(s => s.cache === cache).js.reduce((sum, js) => sum + js.compressedBodyBytes, 0))),
  })), unavailable: rows[0]?.unavailable }, null, 2));
