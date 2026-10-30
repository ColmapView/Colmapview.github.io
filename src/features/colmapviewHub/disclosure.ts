export type HubDisclosureKind = 'public' | 'private' | 'bucket';

const LINES: Record<HubDisclosureKind, string> = {
  public: 'Also creates a short Spatial Hub link. Anyone with it sees the title, description, preview and dataset link.',
  private: 'Also creates an unguessable Spatial Hub link. Anyone with it sees the title, description, preview and dataset link; the data still needs access.',
  bucket: 'Also creates a Spatial Hub link (short if the bucket is public). Anyone with it sees the title, description, preview and dataset link.',
};
const ORIGINAL_IMAGES = 'Original photos can retain metadata, such as location.';

/**
 * The line beside the publish button, or null where the Hub is off. A Hub draft exists exactly when
 * this line shows (the controller's prepare checks the same enabled state), so publicAcknowledged confirms it.
 */
export function hubDisclosure(enabled: boolean, kind: HubDisclosureKind, originalImages: boolean): string | null {
  if (!enabled) return null;
  return originalImages && kind !== 'private' ? `${LINES[kind]} ${ORIGINAL_IMAGES}` : LINES[kind];
}
