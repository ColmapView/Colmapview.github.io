import { describe, expect, it } from 'vitest';
import {
  getIdleTimeoutDelayMs,
  hasDeliberateIdlePointerMove,
  IDLE_HIDEABLE_SELECTOR,
  IDLE_IGNORE_SELECTOR,
  IDLE_PAUSE_TARGET_SELECTOR,
  IDLE_MOVE_THRESHOLD_PX,
  isIdleFocusPauseTarget,
  isIdleHideableTarget,
  isIdleIgnoredTarget,
  isIdlePauseTarget,
  shouldResumeIdleTimerAfterFocusOut,
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

  it('detects popup and interactive targets that should pause idle hiding', () => {
    expect(IDLE_PAUSE_TARGET_SELECTOR).toContain(IDLE_HIDEABLE_SELECTOR);

    const popup = document.createElement('div');
    popup.dataset.idlePause = 'true';
    const popupPadding = document.createElement('div');
    popup.appendChild(popupPadding);

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');

    const button = document.createElement('button');
    const disabledButton = document.createElement('button');
    disabledButton.disabled = true;

    const nativeSelect = document.createElement('select');

    expect(isIdlePauseTarget(popupPadding)).toBe(true);
    expect(isIdlePauseTarget(menu)).toBe(true);
    expect(isIdlePauseTarget(button)).toBe(true);
    expect(isIdlePauseTarget(disabledButton)).toBe(false);
    expect(isIdlePauseTarget(nativeSelect)).toBe(true);
    expect(isIdlePauseTarget(document.createElement('div'))).toBe(false);
  });

  it('ignores pause targets inside an explicitly ignored idle scope', () => {
    const gallery = document.createElement('div');
    gallery.dataset.idleIgnore = 'true';
    const button = document.createElement('button');
    const select = document.createElement('select');
    gallery.append(button, select);

    expect(IDLE_IGNORE_SELECTOR).toBe('[data-idle-ignore="true"]');
    expect(isIdleIgnoredTarget(button)).toBe(true);
    expect(isIdlePauseTarget(button)).toBe(false);
    expect(isIdleFocusPauseTarget(select)).toBe(false);
  });

  it('limits focus pauses to popup and text/select controls', () => {
    const popup = document.createElement('div');
    popup.dataset.idlePause = 'true';
    const popupButton = document.createElement('button');
    popup.appendChild(popupButton);

    const standaloneButton = document.createElement('button');
    const input = document.createElement('input');
    const select = document.createElement('select');

    expect(isIdleFocusPauseTarget(popupButton)).toBe(true);
    expect(isIdleFocusPauseTarget(input)).toBe(true);
    expect(isIdleFocusPauseTarget(select)).toBe(true);
    expect(isIdleFocusPauseTarget(standaloneButton)).toBe(false);
  });

  it('resumes the timer only when mouseout leaves idle pause UI', () => {
    const idleHideable = document.createElement('div');
    idleHideable.className = IDLE_HIDEABLE_SELECTOR.slice(1);
    const child = document.createElement('span');
    idleHideable.appendChild(child);

    expect(shouldResumeIdleTimerAfterMouseOut(child)).toBe(false);
    expect(shouldResumeIdleTimerAfterMouseOut(document.createElement('button'))).toBe(false);
    expect(shouldResumeIdleTimerAfterMouseOut(document.createElement('div'))).toBe(true);
    expect(shouldResumeIdleTimerAfterMouseOut(null)).toBe(true);
  });

  it('resumes the timer only when focus leaves focus pause UI', () => {
    const select = document.createElement('select');
    const button = document.createElement('button');
    const plain = document.createElement('div');

    expect(shouldResumeIdleTimerAfterFocusOut(select)).toBe(false);
    expect(shouldResumeIdleTimerAfterFocusOut(button)).toBe(true);
    expect(shouldResumeIdleTimerAfterFocusOut(plain)).toBe(true);
    expect(shouldResumeIdleTimerAfterFocusOut(null)).toBe(true);
  });
});
