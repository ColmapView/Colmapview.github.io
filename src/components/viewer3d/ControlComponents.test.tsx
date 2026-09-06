import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ControlButton, type PanelType } from './ControlComponents';
vi.mock('./useControlButtonStoreFacade', () => ({ useControlButtonStoreFacade: () => ({ touchMode: false, contextMenuOpen: false }) }));
afterEach(cleanup);
function Harness() {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  return <><ControlButton panelId="settings" activePanel={activePanel} setActivePanel={setActivePanel} icon="S" tooltip="Settings" panelTitle="Settings"><button>Inside</button></ControlButton><button>Outside</button></>;
}
it('opens with the keyboard, retains child focus on mouse leave, and restores focus on Escape', () => {
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Settings' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const inside = screen.getByRole('button', { name: 'Inside' });
  inside.focus();
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
