import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetAccountButtons } from '../dropzone/DatasetAccountButtons';
import { HuggingFaceAccountButton } from '../viewer3d/HuggingFaceAccountButton';
import { hfAuth, type HfAuthState } from '../../features/huggingface/auth';
import { getHfAccountConfiguration } from '../../features/huggingface/config';

vi.mock('../../features/huggingface/config', async importOriginal => ({
  ...await importOriginal<typeof import('../../features/huggingface/config')>(),
  getHfAccountConfiguration: vi.fn(),
}));
vi.mock('../../features/googleDrive/config', async importOriginal => ({
  ...await importOriginal<typeof import('../../features/googleDrive/config')>(),
  isGoogleDriveEnabled: () => false,
}));
vi.mock('../../features/googleDrive/picker', () => ({ getGoogleDrivePickerConfig: () => null }));
vi.mock('../viewer3d/useControlButtonStoreFacade', () => ({
  useControlButtonStoreFacade: () => ({ touchMode: false, contextMenuOpen: false }),
}));

const config = { clientId: 'test-client', redirectUri: 'http://localhost/hf-callback.html', readOnly: true };
const states: Array<[string, HfAuthState]> = [
  ['disconnected', { status: 'disconnected', identity: null, error: null }],
  ['connecting', { status: 'connecting', identity: null, error: null }],
  ['connected', { status: 'connected', identity: { username: 'test-user' }, error: null }],
  ['error', { status: 'disconnected', identity: null, error: 'Sign-in expired.' }],
];

beforeEach(() => {
  vi.mocked(getHfAccountConfiguration).mockReturnValue({ status: 'ready', config });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Keep both account entry points consistent, including generated IDs and access notices.
describe.each(['landing', 'toolbar'] as const)('%s account dialog DOM', surface => {
  function open() {
    if (surface === 'landing') render(<DatasetAccountButtons onOpenUrlModal={vi.fn()} onLoadRemoteDataset={vi.fn()} />);
    else render(<HuggingFaceAccountButton config={config} activePanel={null} setActivePanel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Hugging Face/ }));
    return screen.getByRole('dialog', { name: 'Hugging Face' });
  }

  it.each(states)('preserves the %s dialog and its accessible name', (_name, state) => {
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue(state);
    const dialog = open();
    expect(dialog).toHaveAccessibleName('Hugging Face');
    const description = surface === 'landing'
      ? state.status === 'connected' ? 'Load a public or private dataset.' : 'Sign in to open private datasets.'
      : state.status === 'connected' ? 'Load private datasets with this account.' : 'Sign in to open private datasets.';
    expect(dialog).toHaveAccessibleDescription(state.status === 'connected'
      ? description : `${description} Allows reading your repositories, including private datasets.`);
    expect(dialog.outerHTML).toMatchSnapshot();
  });

  it('preserves the publishing access hint', () => {
    config.readOnly = false;
    try {
      vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue(states[0][1]);
      const dialog = open();
      expect(screen.getByText('Allows reading private repositories and creating datasets.')).toBeVisible();
      expect(dialog.outerHTML).toMatchSnapshot();
    } finally { config.readOnly = true; }
  });
});
