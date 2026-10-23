import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import type { Plugin, ResolvedConfig } from 'vite';

/** Pages limits each asset to 25 MiB; the optional 31 MiB decoder ships compressed. */
export function videoDecoderAsset(): Plugin {
  const moduleId = 'virtual:video-decoder-wasm', internalId = '\0' + moduleId;
  const endpoint = '__video_decoder__/ffmpeg-core.wasm.gz';
  let config: ResolvedConfig, compressed: Buffer | undefined;
  const bytes = () => compressed ??= gzipSync(readFileSync(createRequire(import.meta.url).resolve('@ffmpeg/core/wasm')), { level: 9 });
  return {
    name: 'video-decoder-asset',
    configResolved(value) { config = value; },
    resolveId(id) { if (id === moduleId) return internalId; },
    load(id) {
      if (id !== internalId) return;
      if (config.command === 'serve') return `export default ${JSON.stringify(config.base + endpoint)};`;
      const reference = this.emitFile({ type: 'asset', name: 'ffmpeg-core.wasm.gz', source: bytes() });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== config.base + endpoint) { next(); return; }
        const body = bytes();
        response.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
        response.end(body);
      });
    },
  };
}
