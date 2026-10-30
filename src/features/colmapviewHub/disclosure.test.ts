import { describe, expect, it } from 'vitest';
import { hubDisclosure } from './disclosure';

const PUBLIC = 'Also creates a short Spatial Hub link. Anyone with it sees the title, description, preview and dataset link.';
const PRIVATE = 'Also creates an unguessable Spatial Hub link. Anyone with it sees the title, description, preview and dataset link; the data still needs access.';
const BUCKET = 'Also creates a Spatial Hub link (short if the bucket is public). Anyone with it sees the title, description, preview and dataset link.';
const ORIGINALS = 'Original photos can retain metadata, such as location.';

describe('hubDisclosure', () => {
  it.each([['public', PUBLIC], ['private', PRIVATE], ['bucket', BUCKET]] as const)('states what a %s upload creates', (kind, line) => {
    expect(hubDisclosure(true, kind, false)).toBe(line);
  });

  it('adds the metadata sentence for original images unless access is private', () => {
    expect(hubDisclosure(true, 'public', true)).toBe(`${PUBLIC} ${ORIGINALS}`);
    expect(hubDisclosure(true, 'bucket', true)).toBe(`${BUCKET} ${ORIGINALS}`);
    expect(hubDisclosure(true, 'private', true)).toBe(PRIVATE);
  });

  it('is absent where the Hub is off', () => {
    expect(hubDisclosure(false, 'public', true)).toBeNull();
  });
});
