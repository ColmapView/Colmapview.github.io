import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MouseTooltip } from './MouseTooltip';
vi.mock('./useMouseTooltipStoreFacade', () => ({ useMouseTooltipStoreFacade: () => ({ touchMode: false }) }));
afterEach(cleanup);
it('describes a focused control and clears on Escape without removing existing descriptions', () => {
  render(<><button data-tooltip="Helpful detail" aria-describedby="existing">Action</button><MouseTooltip /></>);
  const button = screen.getByRole('button');
  vi.spyOn(button, 'matches').mockReturnValue(true);
  fireEvent.focusIn(button);
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip).toHaveTextContent('Helpful detail');
  expect(button.getAttribute('aria-describedby')).toContain(tooltip.id);
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(button).toHaveAttribute('aria-describedby', 'existing');
});

it('keeps a mouse hint dismissed until the pointer leaves its owner', () => {
  render(<><button data-tooltip="Hint">Action</button><MouseTooltip /></>);
  const button = screen.getByRole('button');
  fireEvent.mouseMove(button, { clientX: 100, clientY: 100 });
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  fireEvent.keyDown(button, { key: 'Escape' });
  fireEvent.mouseMove(button, { clientX: 101, clientY: 100 });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.mouseOut(button, { relatedTarget: document.body });
  fireEvent.mouseOver(button);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
});

it('ignores mousemove over elements without tooltips so idle pointer movement causes no state updates', () => {
  render(<><div data-testid="empty">Canvas</div><button data-tooltip="Hint">Action</button><MouseTooltip /></>);
  const empty = screen.getByTestId('empty');
  const button = screen.getByRole('button');
  fireEvent.mouseMove(empty, { clientX: 50, clientY: 60 });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.mouseMove(button, { clientX: 120, clientY: 140 });
  expect(screen.getByRole('tooltip')).toHaveTextContent('Hint');
  fireEvent.mouseMove(empty, { clientX: 200, clientY: 220 });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
