/** Read a browser Blob without assuming Blob.arrayBuffer is available in every test/runtime. */
async function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await blobBytes(blob));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
