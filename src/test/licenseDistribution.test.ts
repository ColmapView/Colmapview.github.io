import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completeLicenseEntries } from '../../viteLicenseNotices';

describe('production dependency notices', () => {
  it('completes omitted upstream notices and includes separately copied libraries', () => {
    const entries = completeLicenseEntries([{ name: '@ffmpeg/core', version: '0.12.10', identifier: 'GPL-2.0-or-later' },
      { name: 'react', version: '19.2.3', identifier: 'MIT', text: 'Retain this upstream notice.' }], resolve('.'));
    expect(entries.find(entry => entry.name === '@ffmpeg/core')?.text).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(entries.find(entry => entry.name === 'react')?.text).toBe('Retain this upstream notice.');
    expect(entries.find(entry => entry.name === 'libarchive.js')?.text).toContain('Copyright (c) 2018');
    expect(entries.find(entry => entry.name === 'gs-toolbox')?.text).toContain('Apache License');
  });

  it('fails a build with an unreviewed missing license instead of publishing an empty heading', () => {
    expect(() => completeLicenseEntries([{ name: 'missing-license', version: '1.0.0' }], resolve('.'))).toThrow('No license text');
  });
});
