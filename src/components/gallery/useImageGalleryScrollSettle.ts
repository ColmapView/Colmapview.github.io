import { useEffect, useReducer, useRef } from 'react';
import { pauseThumbnailCache, resumeThumbnailCache } from '../../hooks/useThumbnail';
import { TIMING } from '../../theme';
import {
  createInitialGalleryScrollSettleState,
  getNextGalleryScrollSettleState,
  getSettledGalleryScrollState,
  shouldScheduleGalleryScrollResume,
  type GalleryScrollSettleState,
} from './imageGalleryScrollSettlePolicy';

type GalleryScrollSettleAction =
  | { type: 'observe'; currentIsScrolling: boolean }
  | { type: 'settled' };

function galleryScrollSettleReducer(
  state: GalleryScrollSettleState,
  action: GalleryScrollSettleAction
): GalleryScrollSettleState {
  if (action.type === 'settled') {
    return getSettledGalleryScrollState(state);
  }

  return getNextGalleryScrollSettleState(state, action.currentIsScrolling);
}

export function useImageGalleryScrollSettle(
  currentIsScrolling: boolean,
  settleDelay: number = TIMING.transitionBase
): boolean {
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrollState, dispatchScrollState] = useReducer(
    galleryScrollSettleReducer,
    currentIsScrolling,
    createInitialGalleryScrollSettleState
  );
  let renderScrollState = scrollState;

  if (scrollState.currentIsScrolling !== currentIsScrolling) {
    renderScrollState = getNextGalleryScrollSettleState(scrollState, currentIsScrolling);
    dispatchScrollState({ type: 'observe', currentIsScrolling });
  }

  useEffect(() => {
    if (currentIsScrolling) {
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
      pauseThumbnailCache();
      return;
    }

    if (!shouldScheduleGalleryScrollResume({
      currentIsScrolling,
      isSettlingAfterScroll: renderScrollState.isSettlingAfterScroll,
      hasPendingResume: scrollTimeoutRef.current !== null,
    })) {
      return;
    }

    scrollTimeoutRef.current = setTimeout(() => {
      scrollTimeoutRef.current = null;
      dispatchScrollState({ type: 'settled' });
      resumeThumbnailCache();
    }, settleDelay);

    return () => {
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [currentIsScrolling, renderScrollState.isSettlingAfterScroll, settleDelay]);

  return currentIsScrolling || renderScrollState.isSettlingAfterScroll;
}
