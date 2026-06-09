import { describe, expect, it } from 'vitest';
import { getNextSplatFile } from './splatFileSourcePolicy';

describe('splat file source policy', () => {
  it('selects the next splat file with wraparound', () => {
    const first = new File(['first'], 'first.spz');
    const second = new File(['second'], 'second.ply');
    const third = new File(['third'], 'third.ply');
    const splatFiles = [first, second, third];

    expect(getNextSplatFile(splatFiles, first)).toBe(second);
    expect(getNextSplatFile(splatFiles, second)).toBe(third);
    expect(getNextSplatFile(splatFiles, third)).toBe(first);
    expect(getNextSplatFile(splatFiles, undefined)).toBe(first);
  });

  it('does not select a next splat when there is only one candidate', () => {
    const only = new File(['only'], 'only.spz');

    expect(getNextSplatFile([only], only)).toBeNull();
    expect(getNextSplatFile([], undefined)).toBeNull();
  });
});
