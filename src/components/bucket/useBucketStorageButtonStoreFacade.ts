import { useUrlLoader } from '../../hooks/useUrlLoader';

export function useBucketStorageButtonStoreFacade() {
  const { loadFromUrl } = useUrlLoader();
  return { loadUrl: (url: string) => { void loadFromUrl(url); } };
}
