/** What a Hub link was made from: the dataset's source key and edit revision at upload. */
export interface HubSource { key: string; revision: number }
export interface HubShareLink { url: string; source: HubSource; readyAt: number }

/** Whether two Hub sources name the same dataset state. */
export const sameHubSource = (a: HubSource, b: HubSource): boolean => a.key === b.key && a.revision === b.revision;

const links = new Map<string, HubShareLink>();
const listeners = new Set<() => void>();

/** Ready Hub links by provider, so the Share panel can offer the newest one for the dataset on screen. */
export const hubShareLinks = {
  set(provider: string, link: HubShareLink | null): void {
    if (link) links.set(provider, link);
    else if (!links.delete(provider)) return;
    listeners.forEach(listener => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Whether any provider holds a ready link. */
  hasAny: (): boolean => links.size > 0,
  /** The newest ready link made from exactly this dataset state; none while deletions are pending. */
  match(source: HubSource, pendingDeletions: number): string | null {
    if (pendingDeletions) return null;
    let newest: HubShareLink | null = null;
    for (const link of links.values()) {
      if (sameHubSource(link.source, source) && (!newest || link.readyAt > newest.readyAt)) newest = link;
    }
    return newest?.url ?? null;
  },
};
