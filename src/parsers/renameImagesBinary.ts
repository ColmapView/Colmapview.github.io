/** Replace only exported image names, keeping poses and observation bytes intact without materializing observations. */
export function renameImagesBinary(bytes: Uint8Array<ArrayBuffer>, names: ReadonlyMap<number, string>): Blob {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: BlobPart[] = [];
  const encoder = new TextEncoder();
  const invalid = () => new Error('The exported images.bin is incomplete.');
  if (bytes.byteLength < 8) throw invalid();
  const count = Number(view.getBigUint64(0, true));
  if (!Number.isSafeInteger(count) || count > Math.floor((bytes.byteLength - 8) / 73)) throw invalid();
  let offset = 8, copied = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 64 >= bytes.byteLength) throw invalid();
    const id = view.getUint32(offset, true);
    const start = offset + 64;
    const end = bytes.indexOf(0, start);
    if (end < 0 || end + 9 > bytes.byteLength) throw invalid();
    const name = names.get(id);
    if (name !== undefined) {
      if (name.includes('\0')) throw new Error('An exported image name contains a null byte.');
      parts.push(bytes.subarray(copied, start), encoder.encode(`${name}\0`)); copied = end + 1;
    }
    const observations = Number(view.getBigUint64(end + 1, true));
    if (!Number.isSafeInteger(observations) || observations > Math.floor((bytes.byteLength - end - 9) / 24)) throw invalid();
    offset = end + 9 + observations * 24;
  }
  if (offset !== bytes.byteLength) throw invalid();
  parts.push(bytes.subarray(copied));
  return new Blob(parts);
}
