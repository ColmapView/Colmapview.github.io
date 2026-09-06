import { buttonStyles } from './buttonStyles';

/**
 * Canonical panel recipes. Load Dataset is the visual reference.
 * Positioning, viewport constraints, and interaction belong to the owning shell.
 */
const surface = 'bg-ds-secondary rounded-lg border border-ds';
const header = 'flex items-center justify-between gap-2 px-4 py-2 select-none';
const title = 'panel-heading text-ds-primary text-sm font-semibold';

export const panelStyles = {
  surface,
  dialog: `${surface} flex flex-col`,
  header,
  draggableHeader: `${header} cursor-move`,
  title,
  startupTitle: 'panel-heading text-ds-primary text-lg font-semibold',
  close: buttonStyles.close,
  body: 'px-4 py-3',
  scrollBody: 'px-4 py-3 overflow-y-auto min-h-0',
  toolBody: 'px-4 py-3 space-y-3',
  inset: 'p-4',
  compactInset: 'p-1',
  overlay: 'fixed inset-0 flex items-center justify-center bg-ds-void/50',
} as const;

/** Compatibility name for existing consumers; never define a second surface. */
export const floatingPanelStyles = {
  surface: panelStyles.surface,
  dialog: panelStyles.dialog,
} as const;
