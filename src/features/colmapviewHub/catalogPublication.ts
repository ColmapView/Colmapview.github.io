import { getHubBaseUrl } from './config';
import { buildHubPayload, type HubMetadata } from './payload';
import { toBase64Url } from '../../utils/urlCameraStateCodec';
import { anySignal, timeoutSignal } from '../../utils/abortSignals';
import { PUBLICATION_LICENSES } from '../datasetPublishing/publicationMetadata';

export interface HubPublicationConfiguration { enabled: boolean; siteKey?: string }
export type HubCatalogReceipt = { status: 'published'; id: string; shareUrl: string; catalogUrl: string }
  | { status: 'pending'; id: string; message: string };

export async function getHubPublicationConfiguration(signal: AbortSignal): Promise<HubPublicationConfiguration> {
  const base = getHubBaseUrl();
  if (!base) return { enabled: false };
  const response = await fetch(`${base}/api/publications/config`, { credentials: 'omit', signal: anySignal([signal, timeoutSignal(10000)]) });
  if (!response.ok) throw new Error('Sharing on Hub is temporarily unavailable.');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('enabled' in value) || typeof value.enabled !== 'boolean') throw new Error('Hub returned invalid configuration.');
  const siteKey = 'siteKey' in value && typeof value.siteKey === 'string' ? value.siteKey : undefined;
  return { enabled: value.enabled && Boolean(siteKey), siteKey };
}

export const newHubManagementSecret = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

export async function publishHubDataset(input: { viewerUrl: string; metadata: HubMetadata; thumbnailBase64: string;
  managementSecret: string; turnstileToken: string }): Promise<HubCatalogReceipt> {
  const base = getHubBaseUrl();
  if (!base) throw new Error('Sharing on Hub is unavailable on this host.');
  const payload = buildHubPayload({ ...input, access: 'public' });
  // Preserve a known identifier for Hub's existing license categories; custom names never imply rights.
  const knownLicense = PUBLICATION_LICENSES.find(option => 'name' in option && option.name === payload.license?.name && option.url === payload.license?.url);
  const response = await fetch(`${base}/api/publications`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, ...(knownLicense ? { license: { ...payload.license, id: knownLicense.id } } : {}),
      listingAcknowledged: true, turnstileToken: input.turnstileToken }), signal: timeoutSignal(30000) });
  const value = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(typeof value?.error === 'string' ? value.error : 'The dataset could not be shared. Try again.');
  if (!value || typeof value.id !== 'string' || !/^[A-Z][a-z]{2,13}[A-Z][a-z]{2,13}-L[A-Za-z0-9_-]{16}$/.test(value.id)) throw new Error('Hub returned an invalid publication.');
  if (value.status === 'pending') return { status: 'pending', id: value.id,
    message: 'Submitted for review. It will appear on Hub after its source is verified.' };
  const share = new URL(`/s/${value.id}`, base).href;
  const catalog = `${base}/#shared-datasets`;
  // Archived viewers still require the original API receipt; normalize either known route.
  if (value.status !== 'published' || value.shareUrl !== share
    || ![catalog, `${base}/datasets/#shared-datasets`].includes(String(value.catalogUrl))) throw new Error('Hub returned an invalid publication.');
  return { status: 'published', id: value.id, shareUrl: share, catalogUrl: catalog };
}
