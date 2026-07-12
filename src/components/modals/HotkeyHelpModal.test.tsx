import type { ReactNode } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store';
import { HotkeyHelpModal } from './HotkeyHelpModal';

function Wrapper({ children }: { children: ReactNode }) {
  return <HotkeysProvider initiallyActiveScopes={['global', 'viewer']}>{children}</HotkeysProvider>;
}

function renderModal() {
  return render(<HotkeyHelpModal />, { wrapper: Wrapper });
}

function pressI() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', code: 'KeyI', bubbles: true }));
  });
}

describe('HotkeyHelpModal', () => {
  afterEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('renders the desktop info button and toggles the panel on click', () => {
    useUIStore.setState({ touchMode: false, embedMode: false });
    renderModal();

    const button = screen.getByTestId('hotkey-info-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Show keyboard shortcuts');
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
  });

  it('toggles the panel with the i hotkey and closes on Escape', () => {
    useUIStore.setState({ touchMode: false, embedMode: false });
    renderModal();

    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();

    pressI();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
  });

  it('hides the button in touch mode but keeps the i hotkey working', () => {
    useUIStore.setState({ touchMode: true, embedMode: false });
    renderModal();

    expect(screen.queryByTestId('hotkey-info-button')).not.toBeInTheDocument();

    pressI();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  it('hides the button in embed mode but keeps the i hotkey working', () => {
    useUIStore.setState({ touchMode: false, embedMode: true });
    renderModal();

    expect(screen.queryByTestId('hotkey-info-button')).not.toBeInTheDocument();

    pressI();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  it('shows both the ? and I toggle keys in the footer', () => {
    useUIStore.setState({ touchMode: false, embedMode: false });
    renderModal();

    fireEvent.click(screen.getByTestId('hotkey-info-button'));

    const questionKey = screen.getByText('?');
    const letterKey = screen.getByText('I');
    expect(questionKey.tagName).toBe('KBD');
    expect(letterKey.tagName).toBe('KBD');
  });

  it('defaults to the Essentials tab and shows the U (undistorted) row', () => {
    useUIStore.setState({ touchMode: false, embedMode: false });
    renderModal();

    fireEvent.click(screen.getByTestId('hotkey-info-button'));

    expect(screen.getByRole('tab', { name: 'Essentials' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // The curated u binding is up front...
    expect(screen.getByText(/Toggle undistorted view/)).toBeInTheDocument();
    // ...and the mouse rows the user asked for sit alongside the key shortcuts.
    expect(screen.getByText('Select camera')).toBeInTheDocument();
    expect(screen.getByText('Go to camera view')).toBeInTheDocument();
    // General-category shortcuts have no tab anymore (user removed it), so a
    // general-only row never renders anywhere in the panel. Image Modal's rows
    // were merged into Essentials, so that tab is gone too.
    expect(screen.queryByText('Reset guide tips')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'General' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Image Modal' })).not.toBeInTheDocument();
  });

  it('wires the ARIA tab pattern: tabs control the panel, panel labelled by the active tab', () => {
    useUIStore.setState({ touchMode: false, embedMode: false });
    renderModal();

    fireEvent.click(screen.getByTestId('hotkey-info-button'));

    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBeTruthy();
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.id).toBeTruthy();
      expect(tab).toHaveAttribute('aria-controls', panel.id);
    }
    // The panel is labelled by whichever tab is active — including after a switch.
    expect(panel).toHaveAttribute(
      'aria-labelledby',
      screen.getByRole('tab', { name: 'Essentials' }).id
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Camera Controls' }));
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      screen.getByRole('tab', { name: 'Camera Controls' }).id
    );
  });

  it('switches tabs: clicking Camera Controls shows camera rows and hides essentials-only rows', () => {
    useUIStore.setState({ touchMode: false, embedMode: false });
    renderModal();

    fireEvent.click(screen.getByTestId('hotkey-info-button'));
    expect(screen.getByText('Select camera')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Camera Controls' }));

    expect(screen.getByRole('tab', { name: 'Camera Controls' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // Camera-only rows are now visible...
    expect(screen.getByText('Switch to next splat file')).toBeInTheDocument();
    // ...and the essentials-only mouse row is hidden on this tab.
    expect(screen.queryByText('Select camera')).not.toBeInTheDocument();
  });

  it('resets to the Essentials tab each time the panel reopens', () => {
    useUIStore.setState({ touchMode: false, embedMode: false });
    renderModal();

    const button = screen.getByTestId('hotkey-info-button');
    fireEvent.click(button); // open
    fireEvent.click(screen.getByRole('tab', { name: 'Camera Controls' }));
    expect(screen.getByRole('tab', { name: 'Camera Controls' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    fireEvent.click(button); // close
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();

    fireEvent.click(button); // reopen
    expect(screen.getByRole('tab', { name: 'Essentials' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText(/Toggle undistorted view/)).toBeInTheDocument();
  });
});
