import { describe, expect, it } from 'vitest';
import {
  getIdleTimeoutDelayMs,
  hasDeliberateIdlePointerMove,
  IDLE_HIDEABLE_SELECTOR,
  IDLE_MOVE_THRESHOLD_PX,
  isIdleHideableTarget,
  shouldResumeIdleTimerAfterMouseOut,
} from './idleTimerPolicy';

describe('idle timer policy', () => {
  it('converts positive timeout seconds to milliseconds and treats zero or negative values as disabled', () => {
    expect(getIdleTimeoutDelayMs(3)).toBe(3_000);
    expect(getIdleTimeoutDelayMs(0)).toBeNull();
    expect(getIdleTimeoutDelayMs(-1)).toBeNull();
  });

  it('does not treat the first pointer move as deliberate movement', () => {
    expect(hasDeliberateIdlePointerMove(null, { x: 10, y: 10 })).toBe(false);
  });

  it('requires movement beyond the strict squared threshold', () => {
    expect(hasDeliberateIdlePointerMove(
      { x: 0, y: 0 },
      { x: IDLE_MOVE_THRESHOLD_PX, y: 0 }
    )).toBe(false);

    expect(hasDeliberateIdlePointerMove(
      { x: 0, y: 0 },
      { x: IDLE_MOVE_THRESHOLD_PX + 1, y: 0 }
    )).toBe(true);

    expect(hasDeliberateIdlePointerMove(
      { x: 0, y: 0 },
      { x: 15, y: 16 }
    )).toBe(true);
  });

  it('detects idle-hideable targets through ancestors', () => {
    const wrapper = document.createElement('div');
    wrapper.className = IDLE_HIDEABLE_SELECTOR.slice(1);
    const child = document.createElement('button');
    wrapper.appendChild(child);

    expect(isIdleHideableTarget(child)).toBe(true);
    expect(isIdleHideableTarget(wrapper)).toBe(true);
    expect(isIdleHideableTarget(document.createElement('div'))).toBe(false);
    expect(isIdleHideableTarget(document.createTextNode('label'))).toBe(false);
    expect(isIdleHideableTarget(new EventTarget())).toBe(false);
    expect(isIdleHideableTarget(null)).toBe(false);
  });

  it('resumes the timer only when mouseout leaves idle-hideable UI', () => {
    const idleHideable = document.createElement('div');
    idleHideable.className = IDLE_HIDEABLE_SELECTOR.slice(1);
    const child = document.createElement('span');
    idleHideable.appendChild(child);

    expect(shouldResumeIdleTimerAfterMouseOut(child)).toBe(false);
    expect(shouldResumeIdleTimerAfterMouseOut(document.createElement('div'))).toBe(true);
    expect(shouldResumeIdleTimerAfterMouseOut(null)).toBe(true);
  });
});
