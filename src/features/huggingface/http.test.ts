import { describe, expect, it } from 'vitest';
import { HfError } from './http';

describe('HfError', () => {
  it('keeps its status and offers a retry unless marked permanent', () => {
    expect(new HfError('Busy', 503)).toMatchObject({ name: 'HfError', message: 'Busy', status: 503, permanent: false });
    expect(new HfError('Too large', undefined, true)).toMatchObject({ status: undefined, permanent: true });
  });
});
