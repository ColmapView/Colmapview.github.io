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
    // ...while a general-only shortcut is not shown on the Essentials tab.
    expect(screen.queryByText('Reset guide tips')).not.toBeInTheDocument();
  });

  it('switches tabs: clicking General shows general rows and hides essentials rows', () => {
    useUIStore.setState({ touchMode: false, embedMode: false });
    renderModal();

    fireEvent.click(screen.getByTestId('hotkey-info-button'));
    expect(screen.getByText(/Toggle undistorted view/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'General' }));

    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    // General rows are now visible...
    expect(screen.getByText('Reset guide tips')).toBeInTheDocument();
    // ...and the essentials u-row (a Camera shortcut) is hidden on the General tab.
    expect(screen.queryByText(/Toggle undistorted view/)).not.toBeInTheDocument();
  });

  it('resets to the Essentials tab each time the panel reopens', () => {
    useUIStore.setState({ touchMode: false, embedMode: false });
    renderModal();

    const button = screen.getByTestId('hotkey-info-button');
    fireEvent.click(button); // open
    fireEvent.click(screen.getByRole('tab', { name: 'General' }));
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');

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
