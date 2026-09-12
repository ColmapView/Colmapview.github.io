import { describe, expect, it } from 'vitest';
import { TrainingDrawProbe } from './trainingDrawProbe';

describe('training draw probe', () => {
  it('records only drawn registered resources, once per file across restoration', () => {
    const probe = new TrainingDrawProbe();
    const node = {}, restored = {}, file = new File([], 'preview.spz');
    probe.register(node, file, 1000000);
    expect(probe.inspect().events).toEqual([]);
    probe.observe([{ node, count: 1000000 }], 0, 1);
    probe.observe([{ node: {}, count: 1000000 }], 1000000, 2);
    expect(probe.inspect().events).toEqual([]);
    probe.observe([{ node, count: 1000000 }], 1000000, 3);
    probe.register(restored, file, 1000000);
    probe.observe([{ node: restored, count: 1000000 }], 1000000, 4);
    expect(probe.inspect().events).toEqual([
      { id: 1, fileName: 'preview.spz', sourceRows: 1000000, mappedRows: 1000000, activeSplats: 1000000, atMs: 3 },
    ]);
    probe.inspect().events[0].sourceRows = 0;
    expect(probe.inspect().events[0].sourceRows).toBe(1000000);
  });

  it('retains mismatched mapping counts as evidence and bounds long sessions', () => {
    const probe = new TrainingDrawProbe();
    for (let i = 0; i < 257; i++) {
      const node = {};
      probe.register(node, new File([], `${i}.spz`), 1000000);
      probe.observe([{ node, count: 500000 }], 500000, i);
    }
    expect(probe.inspect().events).toHaveLength(256);
    expect(probe.inspect().events[0].mappedRows).toBe(500000);
    expect(probe.inspect().overflow).toBe(true);
  });
});
