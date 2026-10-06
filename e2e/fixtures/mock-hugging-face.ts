import type { BrowserContext, Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** In-memory HTTP Hub fixture: exercises the real browser SDK without publishing data. */
export function createMockHuggingFace(options: { lfs?: boolean } = {}) {
  let sequence = 0;
  const commits: Array<{ id: string; title: string; message: string; authors: { user: string; avatar: string }[]; date: string }> = [];
  const snapshots = new Map<string, Map<string, Buffer>>();
  let files = new Map<string, Buffer>();
  const reads: Array<{ path: string; authorization?: string }> = [];
  const writes: string[] = [];
  const lfsObjects = new Map<string, Buffer>();
  const uploadParts = new Map<string, Map<number, { content: Buffer; etag: string }>>();
  const multipartChunkBytes = 4 * 1024 * 1024;
  let uploadServer: Server | undefined;
  let uploadOrigin = '';
  let failedMetadata = false;
  let denyConsent = false;
  let failMetadataOnce = false;
  // Like the Hub, `main` names the latest commit.
  const snapshotAt = (revision: string) => snapshots.get(revision === 'main' ? commits[0]?.id ?? '' : revision);
  const save = (title: string, message = '') => {
    const id = (++sequence).toString(16).padStart(40, '0');
    snapshots.set(id, new Map(files));
    commits.unshift({ id, title, message, authors: [{ user: 'publisher', avatar: '' }], date: new Date().toISOString() });
    return id;
  };
  const attach = async (context: BrowserContext, origin: string) => {
    if (options.lfs && !uploadServer) {
      // Firefox's route interception omits Blob request bodies. A real loopback
      // endpoint checks the unmodified SDK's binary bytes in either browser.
      uploadServer = createServer(async (request, response) => {
        response.setHeader('access-control-allow-origin', origin);
        response.setHeader('access-control-allow-methods', 'PUT, OPTIONS');
        response.setHeader('access-control-allow-headers', 'content-type,x-request-id');
        response.setHeader('access-control-expose-headers', 'etag');
        if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
        const match = /^\/mock-upload\/([a-f0-9]{64})(?:\/(\d+))?$/.exec(request.url ?? '');
        const oid = match?.[1];
        if (request.method !== 'PUT' || !oid) { response.writeHead(404); response.end(); return; }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const content = Buffer.concat(chunks);
          if (match?.[2]) {
            const etag = createHash('md5').update(content).digest('hex');
            const parts = uploadParts.get(oid) ?? new Map();
            parts.set(Number(match[2]), { content, etag }); uploadParts.set(oid, parts);
            response.writeHead(200, { etag, 'content-length': '0' }); response.end(); return;
          }
          if (createHash('sha256').update(content).digest('hex') !== oid) { response.writeHead(400); response.end('hash mismatch'); return; }
          lfsObjects.set(oid, content);
          response.writeHead(200, { 'content-length': '0' }); response.end();
        } catch { response.writeHead(500); response.end(); }
      });
      await new Promise<void>(resolve => uploadServer!.listen(0, '127.0.0.1', resolve));
      uploadOrigin = `http://127.0.0.1:${(uploadServer.address() as AddressInfo).port}`;
    }
    await context.route('https://huggingface.co/**', async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, HEAD, POST, PUT, OPTIONS',
        'access-control-allow-headers': 'authorization,content-type,range,x-request-id', 'access-control-expose-headers': 'content-length,content-range' };
      const json = (value: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(value) });
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
      if (path === '/.well-known/openid-configuration') {
        await json({ authorization_endpoint: 'https://huggingface.co/oauth/authorize', token_endpoint: 'https://huggingface.co/oauth/token', userinfo_endpoint: 'https://huggingface.co/oauth/userinfo' }); return;
      }
      if (path === '/oauth/authorize') {
        const callback = new URL(url.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', url.searchParams.get('state')!);
        callback.searchParams.set(denyConsent ? 'error' : 'code', denyConsent ? 'access_denied' : 'browser-test-code');
        await route.fulfill({ status: 302, headers: { location: callback.href } }); return;
      }
      if (path === '/oauth/token') {
        const body = new URLSearchParams(request.postData()!);
        if (body.get('client_id') !== 'colmapview-browser-test' || !body.get('code_verifier') || body.has('client_secret')) {
          await json({ error: 'invalid public client exchange' }, 400); return;
        }
        await json({ access_token: 'hf_browser_test_only', expires_in: 3600, scope: 'openid profile read-repos contribute-repos' }); return;
      }
      if (path === '/oauth/userinfo') { await json({ preferred_username: 'publisher' }); return; }
      if (path === '/api/datasets/publisher/scene') { await json({ id: 'publisher/scene', private: false }); return; }
      if (request.method() === 'POST') writes.push(path);
      if (path === '/api/repos/create') {
        if (commits.length) { await json({ error: 'already exists' }, 409); return; }
        const body = request.postDataJSON();
        if (body.organization !== 'publisher' || body.type !== 'dataset' || body.visibility !== 'public') {
          await json({ error: 'wrong destination' }, 400); return;
        }
        for (const file of body.files) files.set(file.path, Buffer.from(file.content, 'base64'));
        save('Initial commit');
        await json({ id: 'test-id', url: 'https://huggingface.co/datasets/publisher/scene' }); return;
      }
      if (path.endsWith('/commits/main')) { await json(commits.slice(0, 2)); return; }
      if (path.endsWith('/preupload/main')) {
        await json({ files: request.postDataJSON().files.map((file: { path: string }) => ({ path: file.path,
          uploadMode: options.lfs && (file.path.endsWith('.bin') || file.path.startsWith('images/')) ? 'lfs' : 'regular', shouldIgnore: false })) }); return;
      }
      if (path.endsWith('/info/lfs/objects/batch')) {
        const batch = request.postDataJSON();
        if (batch.transfers.includes('xet')) { await json({ error: 'Untested transport advertised' }, 400); return; }
        await json({ transfer: 'multipart', objects: batch.objects.map((object: { oid: string; size: number }) => {
          if (lfsObjects.has(object.oid)) return object;
          const multipart = object.size > multipartChunkBytes;
          const upload = multipart ? { href: `https://huggingface.co/mock-complete/${object.oid}`,
            header: { chunk_size: String(multipartChunkBytes),
              ...Object.fromEntries(Array.from({ length: Math.ceil(object.size / multipartChunkBytes) }, (_, index) =>
                [String(index + 1).padStart(5, '0'), `${uploadOrigin}/mock-upload/${object.oid}/${index + 1}`])) } }
            : { href: `${uploadOrigin}/mock-upload/${object.oid}` };
          return { ...object, actions: { upload } };
        }) }); return;
      }
      if (path.startsWith('/mock-complete/')) {
        const body = request.postDataJSON();
        const parts = uploadParts.get(body.oid);
        if (!parts || body.parts.some((part: { partNumber: number; etag: string }) => parts.get(part.partNumber)?.etag !== part.etag)) {
          await json({ error: 'missing upload part' }, 400); return;
        }
        const content = Buffer.concat(body.parts.map((part: { partNumber: number }) => parts.get(part.partNumber)!.content));
        if (createHash('sha256').update(content).digest('hex') !== body.oid) { await json({ error: 'hash mismatch' }, 400); return; }
        lfsObjects.set(body.oid, content);
        await json({}); return;
      }
      if (path.endsWith('/commit/main')) {
        const entries = request.postData()!.split('\n').filter(Boolean).map(line => JSON.parse(line));
        const header = entries[0].value;
        if (header.parentCommit !== commits[0]?.id) { await json({ error: 'changed parent' }, 409); return; }
        if (failMetadataOnce && !failedMetadata && entries.some(entry => entry.value.path === 'colmapview.json')) {
          failedMetadata = true; await json({ error: 'temporary metadata rejection' }, 400); return;
        }
        files = new Map(files);
        for (const entry of entries.slice(1)) {
          if (entry.key === 'lfsFile') {
            const content = lfsObjects.get(entry.value.oid);
            if (!content || content.length !== entry.value.size) { await json({ error: 'missing LFS object' }, 400); return; }
            files.set(entry.value.path, content); continue;
          }
          if (entry.key !== 'file') { await json({ error: 'unexpected operation' }, 400); return; }
          files.set(entry.value.path, Buffer.from(entry.value.content, 'base64'));
        }
        const id = save(header.summary, header.description);
        await json({ commitOid: id, commitUrl: `https://huggingface.co/datasets/publisher/scene/commit/${id}`, hookOutput: '' }); return;
      }
      const tree = /\/tree\/([^/]+)/.exec(path);
      if (tree) {
        reads.push({ path, authorization: request.headers().authorization });
        const snapshot = snapshotAt(tree[1]);
        if (!snapshot) { await json({ error: 'unknown revision' }, 404); return; }
        await json([...snapshot].map(([path, content]) => ({ path, size: content.length, type: 'file', oid: createHash('sha1').update(content).digest('hex') }))); return;
      }
      const resolved = /\/resolve\/([^/]+)\/(.+)$/.exec(path);
      if (resolved) {
        reads.push({ path, authorization: request.headers().authorization });
        const content = snapshotAt(resolved[1])?.get(decodeURIComponent(resolved[2]));
        if (!content) { await json({ error: 'not found' }, 404); return; }
        await route.fulfill({ status: 200, headers: { ...headers, 'content-length': String(content.length) }, body: content }); return;
      }
      await json({ error: `Unhandled mock Hub route: ${path}` }, 404);
    });
  };
  const close = () => new Promise<void>(resolve => {
    if (!uploadServer) { resolve(); return; }
    uploadServer.close(() => resolve()); uploadServer.closeAllConnections();
  });
  return { attach, close, reads, writes, commits, snapshots, get files() { return files; },
    denyConsent: () => { denyConsent = true; }, failMetadata: () => { failMetadataOnce = true; },
    /** Someone else's repository already uses the name. */
    occupy: () => { save('Unrelated dataset'); } };
}
