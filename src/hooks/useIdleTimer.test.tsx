import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../store';
import { useIdleTimer } from './useIdleTimer';

function IdleTimerHarness() {
  const containerRef = useIdleTimer();
  return <div ref={containerRef} data-testid="scene" />;
}

function dispatchMouseOut(target: Element, relatedTarget: Element | null) {
  const event = new MouseEvent('mouseout', { bubbles: true });
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  target.dispatchEvent(event);
}

function expectHoverToPauseIdleHiding(target: Element) {
  const scene = screen.getByTestId('scene');

  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

  act(() => {
    vi.advanceTimersByTime(1_100);
  });

  expect(scene).toHaveAttribute('data-idle', 'false');
  expect(useUIStore.getState().isIdle).toBe(false);

  dispatchMouseOut(target, document.body);

  act(() => {
    vi.advanceTimersByTime(1_100);
  });

  expect(scene).toHaveAttribute('data-idle', 'true');
  expect(useUIStore.getState().isIdle).toBe(true);
}

describe('useIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUIStore.setState({ idleHideTimeout: 1, isIdle: false });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.useRealTimers();
    useUIStore.setState({ idleHideTimeout: 3, isIdle: false });
  });

  it('pauses idle hiding while hovering a popup outside the scene container', () => {
    render(<IdleTimerHarness />);

    const portalMenu = document.createElement('div');
    portalMenu.dataset.idlePause = 'true';
    document.body.appendChild(portalMenu);

    expectHoverToPauseIdleHiding(portalMenu);
  });

  it('pauses idle hiding while hovering standalone buttons outside the scene container', () => {
    render(<IdleTimerHarness />);

    const portalButton = document.createElement('button');
    document.body.appendChild(portalButton);

    expectHoverToPauseIdleHiding(portalButton);
  });

  it('pauses idle hiding while hovering menu surfaces outside the scene container', () => {
    render(<IdleTimerHarness />);

    const portalMenu = document.createElement('div');
    portalMenu.setAttribute('role', 'menu');
    document.body.appendChild(portalMenu);

    expectHoverToPauseIdleHiding(portalMenu);
  });

  it('does not wake or pause idle hiding while hovering ignored gallery surfaces', () => {
    render(<IdleTimerHarness />);

    const gallery = document.createElement('div');
    gallery.dataset.idleIgnore = 'true';
    gallery.dataset.testid = 'image-gallery';
    const galleryButton = document.createElement('button');
    gallery.appendChild(galleryButton);
    document.body.appendChild(gallery);

    galleryButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    act(() => {
      vi.advanceTimersByTime(1_100);
    });

    expect(screen.getByTestId('scene')).toHaveAttribute('data-idle', 'true');
    expect(useUIStore.getState().isIdle).toBe(true);
  });

  it('pauses idle hiding while hovering plain footer text inside a pause surface', () => {
    render(<IdleTimerHarness />);

    const footer = document.createElement('footer');
    footer.dataset.idlePause = 'true';
    const footerText = document.createElement('span');
    footerText.textContent = 'ColmapView by OpsiClear';
    footer.appendChild(footerText);
    document.body.appendChild(footer);

    expectHoverToPauseIdleHiding(footerText);
  });

  it('keeps hidden chrome hidden during scene movement until a pause target is reached', () => {
    render(<IdleTimerHarness />);
    const scene = screen.getByTestId('scene');

    act(() => {
      vi.advanceTimersByTime(1_100);
    });
    expect(scene).toHaveAttribute('data-idle', 'true');

    fireEvent.pointerMove(scene, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(scene, { clientX: 50, clientY: 0 });
    expect(scene).toHaveAttribute('data-idle', 'true');

    const chromeButton = document.createElement('button');
    chromeButton.className = 'idle-hideable';
    scene.appendChild(chromeButton);
    chromeButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(scene).toHaveAttribute('data-idle', 'false');
    expect(useUIStore.getState().isIdle).toBe(false);
  });

  it('does not postpone hiding during repeated scene movement outside functional UI', () => {
    render(<IdleTimerHarness />);
    const scene = screen.getByTestId('scene');

    fireEvent.pointerMove(scene, { clientX: 0, clientY: 0 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.pointerMove(scene, { clientX: 50, clientY: 0 });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(scene).toHaveAttribute('data-idle', 'true');
    expect(useUIStore.getState().isIdle).toBe(true);
  });
});
