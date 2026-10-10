import { timeoutSignal } from '../../utils/abortSignals';
import { assertBucketResponse, bucketRequest, bucketXml, xmlValue } from './client';
import { bucketObjectUrl } from './paths';
import { BucketError, type BucketSession } from './types';

const MULTIPART_THRESHOLD = 32 * 1024 * 1024;
const PART_BYTES = 16 * 1024 * 1024;
const MAX_PARTS = 10_000;
const MAX_PART_BYTES = 5 * 1024 ** 3;
const xmlEscape = (value: string) => value.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);

/** Native Blob slices bound each transfer without copying a large object into JavaScript memory. */
export async function uploadBucketObject(session: BucketSession, key: string, blob: Blob, signal: AbortSignal,
  progress: (bytesDone: number) => void = () => {}) {
  signal.throwIfAborted();
  session.signal.throwIfAborted();
  if (!session.canWrite) throw new BucketError('Connect with an access key and secret to upload.');
  const objectUrl = bucketObjectUrl(session.config.baseUrl, key);
  const contentType = blob.type || 'application/octet-stream';
  if (blob.size < MULTIPART_THRESHOLD) {
    const response = await bucketRequest(session, objectUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType }, signal });
    await assertBucketResponse(response);
    await response.body?.cancel();
    signal.throwIfAborted();
    progress(blob.size);
    return;
  }
  const partBytes = Math.max(PART_BYTES, Math.ceil(blob.size / MAX_PARTS / (1024 * 1024)) * 1024 * 1024);
  if (partBytes > MAX_PART_BYTES) throw new BucketError('This object is too large for an S3 multipart upload.');
  const start = new URL(objectUrl);
  start.searchParams.set('uploads', '');
  const created = await bucketXml(await bucketRequest(session, start.href,
    { method: 'POST', headers: { 'Content-Type': contentType }, signal }), 'InitiateMultipartUploadResult');
  const uploadId = xmlValue(created, 'UploadId');
  if (!uploadId) throw new BucketError('The bucket did not return a multipart upload ID.');
  const parts: Array<{ number: number; etag: string }> = [];
  let completed = false;
  try {
    for (let offset = 0; offset < blob.size; offset += partBytes) {
      signal.throwIfAborted();
      const number = parts.length + 1;
      const end = Math.min(blob.size, offset + partBytes);
      const url = new URL(objectUrl);
      url.searchParams.set('partNumber', String(number));
      url.searchParams.set('uploadId', uploadId);
      const response = await bucketRequest(session, url.href, { method: 'PUT', body: blob.slice(offset, end), signal });
      await assertBucketResponse(response);
      const etag = response.headers.get('ETag');
      await response.body?.cancel();
      if (!etag || etag.length > 1024) throw new BucketError('The bucket did not expose ETag. Add ETag to its CORS exposed headers, then retry.');
      parts.push({ number, etag });
      progress(end);
    }
    const url = new URL(objectUrl);
    url.searchParams.set('uploadId', uploadId);
    const body = '<CompleteMultipartUpload>' + parts.map(part => `<Part><PartNumber>${part.number}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`).join('') + '</CompleteMultipartUpload>';
    // S3 can return HTTP 200 with an XML Error body: the result element confirms completion.
    await bucketXml(await bucketRequest(session, url.href, { method: 'POST', body, headers: { 'Content-Type': 'application/xml' }, signal }),
      'CompleteMultipartUploadResult');
    signal.throwIfAborted();
    completed = true;
  } finally {
    if (!completed) {
      // Cleanup has its own deadline so the caller's cancellation/disconnect cannot suppress it.
      await session.abortMultipart(key, uploadId, timeoutSignal(10_000)).catch(() => {});
    }
  }
}
