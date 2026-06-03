import type { CSSProperties } from 'react';
import type { ConfirmationRequest } from '../../utils/confirmation';
import { Z_INDEX } from '../../theme';

const BASE_CONFIRMATION_DIALOG_CLASS =
  'w-full rounded-lg border border-ds bg-ds-tertiary shadow-ds-lg p-5';

const CONFIRMATION_DIALOG_MAX_WIDTH_PX: Record<NonNullable<ConfirmationRequest['size']>, number> = {
  compact: 340,
  default: 420,
};

export function getConfirmationOverlayStyle(): CSSProperties {
  return {
    zIndex: Z_INDEX.mouseTooltip + 1,
  };
}

export function getConfirmationDialogClass(size: ConfirmationRequest['size'] = 'default'): string {
  void size;
  return BASE_CONFIRMATION_DIALOG_CLASS;
}

export function getConfirmationDialogStyle(size: ConfirmationRequest['size'] = 'default'): CSSProperties {
  return {
    maxWidth: CONFIRMATION_DIALOG_MAX_WIDTH_PX[size ?? 'default'],
  };
}
