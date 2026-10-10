import type { ConfirmationRequest } from '../../../utils/confirmation';

export const SETTINGS_PANEL_SECTION_LABELS = {
  profiles: 'Profiles',
  configuration: 'Configuration',
  customization: 'Customization',
  developer: 'Developer',
} as const;

export const SETTINGS_CONFIG_DOWNLOAD = {
  filename: 'colmapview-config.yml',
  mimeType: 'text/yaml',
} as const;

export const SETTINGS_EXAMPLE_MANIFEST_DOWNLOAD = {
  filename: 'manifest.json',
  mimeType: 'application/json',
} as const;

export const CLEAR_SETTINGS_CONFIRMATION: ConfirmationRequest = {
  title: 'Clear settings?',
  message: 'This will clear all saved settings and reload the app.',
  confirmLabel: 'Clear',
  tone: 'danger',
  size: 'compact',
};

export const EXAMPLE_MANIFEST_DESCRIPTION = 'JSON file for loading COLMAP reconstructions from URLs.';

export function formatIdleHideTimeoutValue(timeoutSeconds: number): string {
  return timeoutSeconds === 0 ? 'Off' : `${timeoutSeconds}s`;
}

export function shouldShowAutoHideEditorButton(timeoutSeconds: number): boolean {
  return timeoutSeconds > 0;
}
