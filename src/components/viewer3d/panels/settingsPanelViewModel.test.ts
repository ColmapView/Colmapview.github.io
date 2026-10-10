import { describe, expect, it } from 'vitest';
import {
  CLEAR_SETTINGS_CONFIRMATION,
  EXAMPLE_MANIFEST_DESCRIPTION,
  SETTINGS_CONFIG_DOWNLOAD,
  SETTINGS_EXAMPLE_MANIFEST_DOWNLOAD,
  SETTINGS_PANEL_SECTION_LABELS,
  formatIdleHideTimeoutValue,
  shouldShowAutoHideEditorButton,
} from './settingsPanelViewModel';

describe('settings panel view-model helpers', () => {
  it('defines stable section labels', () => {
    expect(SETTINGS_PANEL_SECTION_LABELS).toEqual({
      profiles: 'Profiles',
      configuration: 'Configuration',
      customization: 'Customization',
      developer: 'Developer',
    });
  });

  it('defines stable download metadata', () => {
    expect(SETTINGS_CONFIG_DOWNLOAD).toEqual({
      filename: 'colmapview-config.yml',
      mimeType: 'text/yaml',
    });
    expect(SETTINGS_EXAMPLE_MANIFEST_DOWNLOAD).toEqual({
      filename: 'manifest.json',
      mimeType: 'application/json',
    });
  });

  it('defines clear-settings confirmation copy', () => {
    expect(CLEAR_SETTINGS_CONFIRMATION).toEqual({
      title: 'Clear settings?',
      message: 'This will clear all saved settings and reload the app.',
      confirmLabel: 'Clear',
      tone: 'danger',
      size: 'compact',
    });
  });

  it('keeps developer manifest helper copy stable', () => {
    expect(EXAMPLE_MANIFEST_DESCRIPTION).toBe('JSON file for loading COLMAP reconstructions from URLs.');
  });

  it('formats auto-hide timeout labels', () => {
    expect(formatIdleHideTimeoutValue(0)).toBe('Off');
    expect(formatIdleHideTimeoutValue(1)).toBe('1s');
    expect(formatIdleHideTimeoutValue(10)).toBe('10s');
  });

  it('shows the auto-hide editor only when auto-hide is enabled', () => {
    expect(shouldShowAutoHideEditorButton(0)).toBe(false);
    expect(shouldShowAutoHideEditorButton(1)).toBe(true);
    expect(shouldShowAutoHideEditorButton(10)).toBe(true);
  });
});
