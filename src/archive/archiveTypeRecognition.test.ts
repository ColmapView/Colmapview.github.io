import { expect, it } from 'vitest';
import { archiveUrlFilename, isPlainTarHeader, tarFilename } from './archiveTypeRecognition';
function header() {
  const bytes = new Uint8Array(512), encoder = new TextEncoder();
  bytes.set(encoder.encode('images/a.png')); bytes.set(encoder.encode('00000000012\0'),124);
  bytes.fill(32,148,156); bytes[156]=48; bytes.set(encoder.encode('ustar\0'),257);
  const sum = bytes.reduce((total,value) => total + value,0);
  bytes.set(encoder.encode(sum.toString(8).padStart(6,'0')+'\0 '),148);
  return bytes;
}
it('recognizes a checksummed TAR and rejects gzip, empty and corrupt headers', () => {
  const tar = header(); expect(isPlainTarHeader(tar)).toBe(true);
  tar[100]++; expect(isPlainTarHeader(tar)).toBe(false);
  expect(isPlainTarHeader(new Uint8Array(512))).toBe(false);
  expect(isPlainTarHeader(new Uint8Array([0x1f,0x8b]))).toBe(false);
  expect(tarFilename('scene.tar.gz')).toBe('scene.tar');
});
it('infers audited Zenodo content routes without treating arbitrary content endpoints as archives', () => {
  expect(archiveUrlFilename('https://zenodo.org/api/records/1/files/scene%20two.zip/content?download=1')).toBe('scene two.zip');
  expect(archiveUrlFilename('https://example.org/files/scene.zip/content')).toBeUndefined();
});
