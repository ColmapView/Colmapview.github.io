import { useTrainingStore } from '../../store';

export function subscribeToTrainingPanelOpen(onOpen: () => void): () => void {
  return useTrainingStore.subscribe((state, previous) => {
    if (state.dockOpen && !previous.dockOpen) onOpen();
  });
}

export function useTrainingPanelStoreFacade() {
  const trainingOpen = useTrainingStore(s => s.dockOpen);
  const setTrainingOpen = useTrainingStore(s => s.setDockOpen);
  return { trainingOpen, setTrainingOpen };
}
