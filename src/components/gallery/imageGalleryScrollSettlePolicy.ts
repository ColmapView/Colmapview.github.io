export type GalleryScrollSettlePhase = 'idle' | 'scrolling' | 'settling';

export interface GalleryScrollSettleState {
  currentIsScrolling: boolean;
  isSettlingAfterScroll: boolean;
}

export interface GalleryScrollSettlePhaseOptions {
  currentIsScrolling: boolean;
  hasObservedScroll: boolean;
}

export function getGalleryScrollSettlePhase({
  currentIsScrolling,
  hasObservedScroll,
}: GalleryScrollSettlePhaseOptions): GalleryScrollSettlePhase {
  if (currentIsScrolling) {
    return 'scrolling';
  }

  return hasObservedScroll ? 'settling' : 'idle';
}

export function getInitialGalleryScrollSettleState(
  phase: GalleryScrollSettlePhase
): boolean {
  return phase === 'settling';
}

export function createInitialGalleryScrollSettleState(
  currentIsScrolling: boolean
): GalleryScrollSettleState {
  return {
    currentIsScrolling,
    isSettlingAfterScroll: false,
  };
}

export function getNextGalleryScrollSettleState(
  state: GalleryScrollSettleState,
  currentIsScrolling: boolean
): GalleryScrollSettleState {
  if (state.currentIsScrolling === currentIsScrolling) {
    return state;
  }

  return {
    currentIsScrolling,
    isSettlingAfterScroll: state.currentIsScrolling && !currentIsScrolling,
  };
}

export function getSettledGalleryScrollState(
  state: GalleryScrollSettleState
): GalleryScrollSettleState {
  return {
    ...state,
    isSettlingAfterScroll: false,
  };
}

export function shouldScheduleGalleryScrollResume({
  currentIsScrolling,
  isSettlingAfterScroll,
  hasPendingResume,
}: {
  currentIsScrolling: boolean;
  isSettlingAfterScroll: boolean;
  hasPendingResume: boolean;
}): boolean {
  return !currentIsScrolling && isSettlingAfterScroll && !hasPendingResume;
}
