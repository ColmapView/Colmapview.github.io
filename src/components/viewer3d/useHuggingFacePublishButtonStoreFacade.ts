import { usePublicationStatusStore } from '../../store';

export function useHuggingFacePublishButtonStoreFacade() {
  const publicationActive = usePublicationStatusStore(state => state.phase !== 'idle');
  return { publicationActive };
}
