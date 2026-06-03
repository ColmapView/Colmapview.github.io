import { describe, expect, it } from 'vitest';
import {
  createInitialGalleryScrollSettleState,
  getGalleryScrollSettlePhase,
  getInitialGalleryScrollSettleState,
  getNextGalleryScrollSettleState,
  getSettledGalleryScrollState,
  shouldScheduleGalleryScrollResume,
} from './imageGalleryScrollSettlePolicy';

describe('imageGalleryScrollSettlePolicy', () => {
  it('derives idle, scrolling, and settling phases', () => {
    expect(getGalleryScrollSettlePhase({
      currentIsScrolling: false,
      hasObservedScroll: false,
    })).toBe('idle');
    expect(getGalleryScrollSettlePhase({
      currentIsScrolling: true,
      hasObservedScroll: false,
    })).toBe('scrolling');
    expect(getGalleryScrollSettlePhase({
      currentIsScrolling: false,
      hasObservedScroll: true,
    })).toBe('settling');
  });

  it('starts only the post-scroll settling phase as active', () => {
    expect(getInitialGalleryScrollSettleState('idle')).toBe(false);
    expect(getInitialGalleryScrollSettleState('scrolling')).toBe(false);
    expect(getInitialGalleryScrollSettleState('settling')).toBe(true);
  });

  it('transitions active scroll into a settling state', () => {
    const idleState = createInitialGalleryScrollSettleState(false);
    expect(idleState).toEqual({
      currentIsScrolling: false,
      isSettlingAfterScroll: false,
    });

    const scrollingState = getNextGalleryScrollSettleState(idleState, true);
    expect(scrollingState).toEqual({
      currentIsScrolling: true,
      isSettlingAfterScroll: false,
    });

    const settlingState = getNextGalleryScrollSettleState(scrollingState, false);
    expect(settlingState).toEqual({
      currentIsScrolling: false,
      isSettlingAfterScroll: true,
    });

    expect(getSettledGalleryScrollState(settlingState)).toEqual({
      currentIsScrolling: false,
      isSettlingAfterScroll: false,
    });
  });

  it('schedules resume only during an unsettled post-scroll phase', () => {
    expect(shouldScheduleGalleryScrollResume({
      currentIsScrolling: false,
      isSettlingAfterScroll: true,
      hasPendingResume: false,
    })).toBe(true);
    expect(shouldScheduleGalleryScrollResume({
      currentIsScrolling: true,
      isSettlingAfterScroll: true,
      hasPendingResume: false,
    })).toBe(false);
    expect(shouldScheduleGalleryScrollResume({
      currentIsScrolling: false,
      isSettlingAfterScroll: false,
      hasPendingResume: false,
    })).toBe(false);
    expect(shouldScheduleGalleryScrollResume({
      currentIsScrolling: false,
      isSettlingAfterScroll: true,
      hasPendingResume: true,
    })).toBe(false);
  });
});
