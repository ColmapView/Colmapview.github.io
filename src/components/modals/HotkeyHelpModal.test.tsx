import type { ReactNode } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store';
import { HotkeyHelpModal } from './HotkeyHelpModal';
import { ABOUT_COLMAP_LINK, ABOUT_PROJECT_LINKS } from './hotkeyHelpViewModel';

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

/** Opens the panel the way the status bar's ⌨ Shortcuts entry does. */
function openFromStatusBar() {
  act(() => {
    useUIStore.getState().setShowHotkeyHelp(true);
  });
}

describe('HotkeyHelpModal', () => {
  it('opens About from the version entry and resets to Essentials for shortcuts', () => {
    renderModal();
    act(() => useUIStore.getState().setShowHotkeyHelp(true, 'about'));
    expect(screen.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    openFromStatusBar();
    expect(screen.getByRole('tab', { name: 'Essentials' })).toHaveAttribute('aria-selected', 'true');
  });

  afterEach(() => {
    // act(): the panel's open state is store-owned now, so resetting the store
    // while the component is still mounted is a React update like any other.
    act(() => {
      useUIStore.setState(useUIStore.getInitialState(), true);
    });
  });

  it('renders nothing at all while closed', () => {
    const { container } = renderModal();

    expect(container).toBeEmptyDOMElement();
  });

  it('toggles the panel with the i hotkey and closes on Escape', () => {
    renderModal();

    expect(screen.queryByText('Help')).not.toBeInTheDocument();

    pressI();
    expect(screen.getByText('Help')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Help')).not.toBeInTheDocument();
  });

  it('toggles the panel shut with a second i press', () => {
    renderModal();

    pressI();
    expect(screen.getByText('Help')).toBeInTheDocument();

    pressI();
    expect(screen.queryByText('Help')).not.toBeInTheDocument();
  });

  it('stays open while the scene is idle (a modal never fades with the chrome)', () => {
    useUIStore.setState({ isIdle: true });
    renderModal();
    openFromStatusBar();

    expect(screen.getByText('Help')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Essentials' })).toBeVisible();
  });

  it('opens from the store in touch mode — the touch status bar Help entry depends on it', () => {
    useUIStore.setState({ touchMode: true });
    renderModal();
    openFromStatusBar();

    expect(screen.getByText('Help')).toBeInTheDocument();
  });

  it('keeps the i hotkey working in embed mode', () => {
    useUIStore.setState({ embedMode: true });
    renderModal();

    pressI();
    expect(screen.getByText('Help')).toBeInTheDocument();
  });

  it('shows both the ? and I toggle keys in the footer', () => {
    renderModal();

    openFromStatusBar();

    const questionKey = screen.getByText('?');
    const letterKey = screen.getByText('I');
    expect(questionKey.tagName).toBe('KBD');
    expect(letterKey.tagName).toBe('KBD');
  });

  it('defaults to the Essentials tab and shows the U (undistorted) row', () => {
    renderModal();

    openFromStatusBar();

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
    renderModal();

    openFromStatusBar();

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
    renderModal();

    openFromStatusBar();
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
    renderModal();

    pressI(); // open
    fireEvent.click(screen.getByRole('tab', { name: 'Camera Controls' }));
    expect(screen.getByRole('tab', { name: 'Camera Controls' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    pressI(); // close
    expect(screen.queryByText('Help')).not.toBeInTheDocument();

    pressI(); // reopen
    expect(screen.getByRole('tab', { name: 'Essentials' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText(/Toggle undistorted view/)).toBeInTheDocument();
  });

  it('opens when the shared store flag is set (the status bar Shortcuts entry)', () => {
    renderModal();

    expect(screen.queryByText('Help')).not.toBeInTheDocument();

    openFromStatusBar();

    expect(screen.getByText('Help')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Essentials' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('shows the brand, project links, license, credit, and version on the About tab', () => {
    renderModal();

    openFromStatusBar();
    fireEvent.click(screen.getByRole('tab', { name: 'About' }));

    expect(screen.getByText('ColmapView by OpsiClear')).toBeInTheDocument();
    expect(screen.getByText('AGPL 3.0')).toBeInTheDocument();
    expect(screen.getByText(/Based on/)).toBeInTheDocument();
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();

    // Every About link renders from its view-model entry with the href/title it
    // declares, and opens safely in a new tab.
    for (const expected of [...ABOUT_PROJECT_LINKS, ABOUT_COLMAP_LINK]) {
      const link = screen.getByRole('link', { name: expected.label });
      expect(link).toHaveAttribute('href', expected.href);
      expect(link).toHaveAttribute('title', expected.title);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }

    // About carries no hotkey rows.
    expect(screen.queryByText('Select camera')).not.toBeInTheDocument();
  });
});
