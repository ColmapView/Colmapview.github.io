import type { Camera, Image } from '../../types/colmap';
import type { ColmapManifest } from '../../types/manifest';
import type { DatasetAccessOptions } from '../types';
import { createImageFileRequestState } from '../../utils/imageFileRequestState';
import { createUrlFileCache } from '../urlFileCache';
import { joinManifestUrlPath } from '../../utils/urlUtils';
import { queueVideoFrame } from './videoFrameQueue';
import type { VideoFrameMedia, VideoImageBinding } from './types';

const manifests = new WeakMap<ReadonlyMap<string, File>, ColmapManifest>();
export const rememberManifestVideoImages = (files: ReadonlyMap<string, File>, manifest: ColmapManifest) => {
  if (manifest.videoImages) manifests.set(files, manifest);
};

export const VIDEO_FRAME_CACHE_BYTES = 64 * 1024 * 1024;
export type DecodeVideoFrame = (name: string, binding: VideoImageBinding, signal: AbortSignal) => Promise<File>;

export function createVideoFrameMedia(bindings: ReadonlyMap<string, VideoImageBinding>, exclusive: boolean,
  decode: DecodeVideoFrame = async (name, binding, signal) => (await import('./decodeVideoFrame')).decodeVideoFrame(name, binding, signal),
  budgetBytes = VIDEO_FRAME_CACHE_BYTES): VideoFrameMedia {
  const cache = createUrlFileCache(budgetBytes).scope('videoFrames');
  const state = createImageFileRequestState(cache);
  let disposed = false;
  return {
    size: bindings.size, exclusive,
    has: name => bindings.has(name),
    async getImage(name: string, options?: DatasetAccessOptions) {
      const binding = bindings.get(name);
      if (!binding || disposed || options?.signal?.aborted) return null;
      const file = await state.request(name, context => queueVideoFrame(context, async () => {
        if (disposed || !context.isCurrent()) return null;
        const result = await decode(name, binding, context.signal);
        return context.isCurrent() && !disposed ? result : null;
      }), options);
      if (file && options?.maxBytes !== undefined && file.size > options.maxBytes) {
        try { options.onError?.({ kind: 'network', message: 'Decoded video frame exceeds the image read budget.' }); } catch { /* Keep File|null settlement. */ }
        return null;
      }
      return file;
    },
    getImageSync: name => disposed ? undefined : state.peekCached(name),
    getStats: cache.getStats,
    clear: state.clear,
    dispose() { disposed = true; state.clear(); },
  };
}

/** Exact registered names and native calibration own the mapping; no filename/time guessing. */
export function prepareManifestVideoImages(files: ReadonlyMap<string, File>, cameras: ReadonlyMap<number, Camera>,
  images: ReadonlyMap<number, Image>): VideoFrameMedia | undefined {
  const manifest = manifests.get(files);
  if (!manifest?.videoImages) return undefined;
  const bindings = new Map<string, VideoImageBinding>();
  const registered = new Map([...images.values()].map(image => [image.name, image]));
  const sizes = new Map<string, number>();
  for (const [name, source] of Object.entries(manifest.videoImages)) {
    const image = registered.get(name), camera = image && cameras.get(image.cameraId);
    if (!image || !camera) throw new Error(`Video frame has no registered camera: ${name}.`);
    const url = joinManifestUrlPath(manifest.baseUrl, source.url);
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new Error('Video sources require credential-free HTTP(S) URLs.');
    if (sizes.has(url) && sizes.get(url) !== source.bytes) throw new Error('Conflicting byte sizes for one video source.');
    if (camera.width * camera.height > 16_000_000) throw new Error('Video frame exceeds the 16 million pixel decode budget.');
    sizes.set(url, source.bytes);
    bindings.set(name, { ...source, url, width: camera.width, height: camera.height });
  }
  return createVideoFrameMedia(bindings, manifest.imagesPath === undefined && !manifest.images?.length && !manifest.imageNameToPath);
}
