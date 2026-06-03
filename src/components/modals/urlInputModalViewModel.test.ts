import { describe, expect, it } from 'vitest';
import {
  getUrlInputHelpItemClassName,
  getUrlInputHelpItemKey,
  getUrlInputActionState,
  getUrlInputHelpIconKind,
  getUrlInputHelpSectionTitleClassName,
  getUrlInputModalOverlayStyle,
  getUrlInputSubmitUrl,
  getUrlInputWarningHelpText,
  isUrlInputWarningHelpSection,
  shouldCloseUrlInputFromBackdrop,
  shouldSubmitUrlInputKey,
  URL_INPUT_DEFAULT_TITLE_CLASS,
  URL_INPUT_HELP_CODE_CLASS,
  URL_INPUT_HELP_ITEM_MUTED_CLASS,
  URL_INPUT_HELP_LIST_CLASS,
  URL_INPUT_HELP_SECTIONS,
  URL_INPUT_WARNING_TEXT_CLASS,
  URL_INPUT_WARNING_TITLE_CLASS,
} from './urlInputModalViewModel';
import { Z_INDEX } from '../../theme';

describe('URL input modal view model', () => {
  it('derives load action state from URL text and loading state', () => {
    expect(getUrlInputActionState('   ', false)).toEqual({
      canLoad: false,
      cancelDisabled: false,
      loadDisabled: true,
      loadLabel: 'Load',
      normalizedUrl: '',
    });

    expect(getUrlInputActionState('  https://example.com/model.zip  ', false)).toEqual({
      canLoad: true,
      cancelDisabled: false,
      loadDisabled: false,
      loadLabel: 'Load',
      normalizedUrl: 'https://example.com/model.zip',
    });

    expect(getUrlInputActionState('https://example.com/model.zip', true)).toMatchObject({
      canLoad: false,
      cancelDisabled: true,
      loadDisabled: true,
      loadLabel: 'Loading...',
    });
  });

  it('normalizes submitted URLs and blocks invalid submit paths', () => {
    expect(getUrlInputSubmitUrl('  https://example.com/model.zip  ', false)).toBe(
      'https://example.com/model.zip'
    );
    expect(getUrlInputSubmitUrl('  ', false)).toBeNull();
    expect(getUrlInputSubmitUrl('https://example.com/model.zip', true)).toBeNull();
  });

  it('derives keyboard, backdrop, and help icon decisions', () => {
    expect(shouldSubmitUrlInputKey('Enter', false)).toBe(true);
    expect(shouldSubmitUrlInputKey('Escape', false)).toBe(false);
    expect(shouldSubmitUrlInputKey('Enter', true)).toBe(false);

    expect(shouldCloseUrlInputFromBackdrop(true, false)).toBe(true);
    expect(shouldCloseUrlInputFromBackdrop(false, false)).toBe(false);
    expect(shouldCloseUrlInputFromBackdrop(true, true)).toBe(false);

    expect(getUrlInputHelpIconKind(true)).toBe('open');
    expect(getUrlInputHelpIconKind(false)).toBe('closed');
  });

  it('keeps supported URL help sections stable', () => {
    expect(URL_INPUT_HELP_SECTIONS.map((section) => section.title)).toEqual([
      'ZIP Files',
      'Cloud Storage URLs',
      'Dropbox',
      'Git Hosting URLs',
      'Local / Self-hosted Server',
      'CORS Requirements',
    ]);
    expect(URL_INPUT_HELP_SECTIONS[0].items[0]).toMatchObject({
      code: 'https://example.com/reconstruction.zip',
    });
    expect(URL_INPUT_HELP_SECTIONS.at(-1)).toMatchObject({
      tone: 'warning',
    });
  });

  it('derives supported URL help render state', () => {
    const regularSection = URL_INPUT_HELP_SECTIONS[0];
    const warningSection = URL_INPUT_HELP_SECTIONS.at(-1);

    if (!warningSection) throw new Error('expected warning section');

    expect(getUrlInputModalOverlayStyle()).toEqual({ zIndex: Z_INDEX.modalOverlay });
    expect(getUrlInputModalOverlayStyle(81)).toEqual({ zIndex: 81 });
    expect(getUrlInputHelpSectionTitleClassName(regularSection)).toBe(URL_INPUT_DEFAULT_TITLE_CLASS);
    expect(getUrlInputHelpSectionTitleClassName(warningSection)).toBe(URL_INPUT_WARNING_TITLE_CLASS);
    expect(isUrlInputWarningHelpSection(regularSection)).toBe(false);
    expect(isUrlInputWarningHelpSection(warningSection)).toBe(true);
    expect(getUrlInputWarningHelpText(warningSection)).toContain('CORS configured');
    expect(getUrlInputWarningHelpText({ items: [] })).toBe('');
    expect(getUrlInputHelpItemClassName({ muted: true })).toBe(URL_INPUT_HELP_ITEM_MUTED_CLASS);
    expect(getUrlInputHelpItemClassName({ muted: false })).toBeUndefined();
    expect(getUrlInputHelpItemKey({
      text: 'Start with:',
      code: 'npx http-server --cors -p 8080',
      suffix: ' locally',
    })).toBe('npx http-server --cors -p 8080Start with: locally');
    expect(URL_INPUT_WARNING_TEXT_CLASS).toBe('text-ds-muted/80');
    expect(URL_INPUT_HELP_LIST_CLASS).toBe('space-y-1 mb-3');
    expect(URL_INPUT_HELP_CODE_CLASS).toBe('text-ds-accent');
  });
});
