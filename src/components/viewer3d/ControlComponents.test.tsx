import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ControlButton, SelectRow, type PanelType } from './ControlComponents';

const mode = vi.hoisted(() => ({ touchMode: false, contextMenuOpen: false }));
vi.mock('./useControlButtonStoreFacade', () => ({ useControlButtonStoreFacade: () => mode }));

beforeEach(() => {
  mode.touchMode = false;
  mode.contextMenuOpen = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Harness({ children = <button>Inside</button> }: { children?: ReactNode }) {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  return (
    <>
      <ControlButton
        panelId="settings"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon="S"
        tooltip="Settings"
        panelTitle="Settings"
      >
        {children}
      </ControlButton>
      <button>Outside</button>
    </>
  );
}

it('opens with the keyboard, retains child focus on mouse leave, and restores focus on Escape', () => {
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Settings' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const inside = screen.getByRole('button', { name: 'Inside' });
  expect(inside).toHaveFocus();
  fireEvent.mouseLeave(trigger.parentElement!);
  expect(screen.getByRole('region')).toBeInTheDocument();
  fireEvent.keyDown(inside, { key: 'Escape' });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('closes when focus leaves the control group', () => {
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Settings' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.blur(trigger, { relatedTarget: screen.getByRole('button', { name: 'Outside' }) });
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('closes when focus leaves the document', () => {
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Settings' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.blur(trigger, { relatedTarget: null });
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('keeps the portaled panel open when the pointer crosses from its trigger to the panel', () => {
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Settings' });
  fireEvent.mouseEnter(trigger.parentElement!);
  const panel = screen.getByRole('region');
  expect(trigger.parentElement).not.toContainElement(panel);
  fireEvent.mouseOut(trigger, { relatedTarget: screen.getByRole('button', { name: 'Inside' }) });
  expect(screen.getByRole('region')).toBe(panel);
  fireEvent.mouseOut(panel, { relatedTarget: screen.getByRole('button', { name: 'Outside' }) });
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('accepts touches inside the portaled panel and dismisses it on an outside touch', () => {
  mode.touchMode = true;
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Settings' });
  fireEvent.click(trigger);
  fireEvent.touchStart(screen.getByRole('button', { name: 'Inside' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.touchStart(screen.getByRole('button', { name: 'Outside' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('preserves tab order through a portaled panel and back to the next control', () => {
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Settings' });
  const galleryNavigation = vi.fn();
  window.addEventListener('keydown', galleryNavigation);
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  window.removeEventListener('keydown', galleryNavigation);
  expect(galleryNavigation).not.toHaveBeenCalled();
  const inside = screen.getByRole('button', { name: 'Inside' });
  expect(inside).toHaveFocus();
  fireEvent.keyDown(inside, { key: 'Tab', shiftKey: true });
  expect(trigger).toHaveFocus();
  fireEvent.keyDown(trigger, { key: 'Tab' });
  expect(inside).toHaveFocus();
  fireEvent.keyDown(inside, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('keeps dropdown arrow keys local while allowing their native behavior and change handler', () => {
  const onChange = vi.fn();
  render(
    <Harness>
      <SelectRow
        label="Display"
        value="frustum"
        onChange={onChange}
        options={[{ value: 'frustum', label: 'Frustum' }, { value: 'arrow', label: 'Arrow' }]}
      />
    </Harness>
  );
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'Settings' }).parentElement!);
  const select = screen.getByRole('combobox', { name: 'Display' });
  const galleryNavigation = vi.fn();
  window.addEventListener('keydown', galleryNavigation);
  try {
    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      expect(fireEvent.keyDown(select, { key })).toBe(true);
    }
    expect(galleryNavigation).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'arrow' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('arrow');
  } finally {
    window.removeEventListener('keydown', galleryNavigation);
  }
});

it('resizes and repositions an open panel as the visible viewport shrinks and pans', () => {
  vi.useFakeTimers();
  const viewport = Object.assign(new EventTarget(), { width: 390, height: 320, offsetLeft: 0, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  render(<Harness />);
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'Settings' }).parentElement!);
  const panel = screen.getByRole('region');
  expect(panel).toHaveStyle({ maxWidth: '374px', maxHeight: '256px' });
  act(() => {
    viewport.width = 320;
    viewport.height = 240;
    viewport.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
  });
  expect(panel).toHaveStyle({ maxWidth: '304px', maxHeight: '176px' });
  act(() => {
    viewport.offsetLeft = 50;
    viewport.offsetTop = 100;
    viewport.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);
  });
  expect(panel).toHaveStyle({ left: '58px', top: '108px' });
});
