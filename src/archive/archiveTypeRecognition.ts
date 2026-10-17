/** Recognize plain TAR only from a nonempty, checksummed 512-byte header. */
export function isPlainTarHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 512 || bytes[0] === 0 || bytes[0] === 0x1f && bytes[1] === 0x8b) return false;
  const checksumText = new TextDecoder().decode(bytes.subarray(148, 156)).replace(/\0/g, '').trim();
  const sizeText = new TextDecoder().decode(bytes.subarray(124, 136)).replace(/\0/g, '').trim();
  if (!/^[0-7]+$/.test(checksumText) || !/^[0-7]+$/.test(sizeText)) return false;
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : bytes[i];
  return checksum === parseInt(checksumText, 8) && [0, 48, 49, 50, 51, 52, 53, 54, 55, 76, 75, 120, 103].includes(bytes[156]);
}
export function tarFilename(name: string): string { return name.replace(/\.(?:tar\.gz|tgz)$/i, '.tar'); }

export function archiveUrlFilename(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'zenodo.org' || parsed.hostname === 'www.zenodo.org') {
      const match = /\/files\/([^/]+)\/content\/?$/.exec(parsed.pathname);
      if (match) return decodeURIComponent(match[1]);
    }
  } catch { /* Ordinary URL validation handles malformed URLs. */ }
  return undefined;
}
