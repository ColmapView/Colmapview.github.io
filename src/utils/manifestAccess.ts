import type { ColmapManifest } from '../types/manifest';
import { HfAccessDeniedError, HfError } from '../features/huggingface/http';
import { huggingFaceDatasetReadRepoId } from './huggingFaceUrl';

type FetchResource = (url: string, init?: RequestInit) => Promise<Response>;

/** Hints explain actual denials. They never authorize a request or initiate sign-in. */
export function withManifestAccess(manifest: ColmapManifest, fetchImpl: FetchResource): FetchResource {
  if (!manifest.access?.length) return fetchImpl;
  return async (url, init) => {
    const repository = huggingFaceDatasetReadRepoId(url);
    const hint = manifest.access?.find(item => item.provider === 'huggingface'
      && item.repository === repository);
    const denial = (status: number) => new HfError(hint?.requirement === 'gated'
      ? 'This Hugging Face dataset is gated. Sign in with an approved account, then retry. You may need to accept terms or request access on Hugging Face first.'
      : 'This Hugging Face dataset requires access. Sign in with an account that can read it, then retry.',
    status, false, { provider: 'hf' });
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      init?.signal?.throwIfAborted();
      // Preserve the provider's 401 distinction between gated access and an expired session.
      if (hint && error instanceof HfError && (error.status === 403
        || error instanceof HfAccessDeniedError && error.status === 401)) throw denial(error.status);
      throw error;
    }
    init?.signal?.throwIfAborted();
    if (hint && [401, 403].includes(response.status)) {
      void response.body?.cancel().catch(() => {});
      throw denial(response.status);
    }
    return response;
  };
}
