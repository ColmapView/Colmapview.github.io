import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** An in-memory S3-style bucket on loopback: signed writes and reads work, anonymous reads are refused. */
export async function startMockBucket(viewerOrigin: string) {
  const objects = new Map<string, Buffer>();
  const anonymousReads: string[] = [];
  const server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', viewerOrigin);
    response.setHeader('access-control-allow-methods', 'GET, HEAD, PUT, POST, DELETE, OPTIONS');
    response.setHeader('access-control-allow-headers', 'authorization, content-type, range, x-amz-date, x-amz-content-sha256, x-amz-security-token, x-amz-user-agent');
    response.setHeader('access-control-expose-headers', 'etag');
    try {
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
      const key = decodeURIComponent(new URL(request.url ?? '/', 'http://bucket.test').pathname);
      if (request.method === 'PUT') {
        objects.set(key, await readBody(request));
        response.writeHead(200, { etag: `"${objects.size}"` });
        response.end();
        return;
      }
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (!request.headers.authorization) { anonymousReads.push(key); response.writeHead(403); response.end('AccessDenied'); return; }
        const object = objects.get(key);
        if (!object) { response.writeHead(404); response.end(); return; }
        response.writeHead(200, { 'content-length': object.length });
        response.end(request.method === 'HEAD' ? undefined : object);
        return;
      }
      response.writeHead(405);
      response.end();
    } catch {
      // An aborted request (e.g. a cancelled PUT) must not become an unhandled rejection.
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/bucket/`,
    objects,
    anonymousReads,
    close: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }),
  };
}
