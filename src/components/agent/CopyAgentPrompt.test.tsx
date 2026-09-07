import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../../utils/clipboard';
import { CopyAgentPrompt } from './CopyAgentPrompt';
import { buildAgentPrompt } from './agentPrompt';
import { useNotificationStore } from '../../store/stores/notificationStore';

vi.mock('../../utils/clipboard', () => ({ copyToClipboard: vi.fn() }));
beforeEach(() => useNotificationStore.getState().clearAll());

describe('agent prompt handoff', () => {
  it('explains copying and pairing on hover and focus, and dismisses with Escape', () => {
    render(<CopyAgentPrompt />);
    const button = screen.getByRole('button', { name: 'Agent' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.mouseEnter(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Paste into your agent');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Settings → Agent controls → Connect MCP');
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it('keeps the deployment path without sharing dataset query state', () => {
    const prompt = buildAgentPrompt('https://example.com/latest/?url=private-data#secret', '/latest/agent-guide.html');
    expect(prompt).toContain('https://example.com/latest/agent-guide.html');
    expect(prompt).not.toContain('private-data');
    expect(prompt).not.toContain('secret');
    expect(prompt).toContain('Do not use computer-use tools');
    expect(prompt).toContain('proactively follow the guide');
  });

  it('copies instructions and reports success', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    render(<CopyAgentPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));
    await waitFor(() => expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ type: 'info', message: 'Agent prompt copied — paste into your agent.', duration: 3000 }),
    ]));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent prompt copied — paste into your agent.')).not.toBeInTheDocument();
    expect(copyToClipboard).toHaveBeenCalledWith(expect.stringContaining('colmap_list_features'));
  });

  it('offers manual copying when clipboard access fails', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(false);
    render(<CopyAgentPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));
    const textarea = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Agent prompt' });
    expect(textarea.value).toContain('colmap_pair');
    expect(useNotificationStore.getState().notifications[0].type).toBe('warning');
  });
});
