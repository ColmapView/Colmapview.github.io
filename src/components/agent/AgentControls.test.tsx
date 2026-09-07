import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AgentControlDialog, AgentControls, AgentSessionStatus } from './AgentControls';
import { ThemeSelect } from '../ui/ThemeSelect';
import { disableAgentControl } from '../../agent/browserBridge';
import { disposeCommands } from '../../commands/runtime';
import { useUITheme } from '../../theme/uiTheme';

afterEach(() => { disableAgentControl(); disposeCommands(); });
it('binds the normal theme control and agent interface to the same state and undo', async () => {
  render(<><AgentControls /><AgentControlDialog /><ThemeSelect /><AgentSessionStatus /></>);
  fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
  fireEvent.click(screen.getByRole('button', { name: 'Agent controls' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enable agent control' })); });
  const api = window.colmapAgent!;
  const state = api.readState();
  act(() => {
    expect(api.execute({ protocolVersion: 1, sessionId: state.sessionId, requestId: 'theme-test', feature: 'settings.ui.theme',
      operation: 'set', expectedRevision: state.revision, datasetGeneration: state.datasetGeneration, input: { value: 'light' } }).status).toBe('succeeded');
  });
  expect(screen.getAllByLabelText('Theme')[0]).toHaveValue('light');
  fireEvent.click(screen.getByRole('button', { name: 'Undo last command' }));
  expect(useUITheme.getState().theme).toBe('dark');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Stop agent' }));
  expect(window.colmapAgent).toBeUndefined();
});
