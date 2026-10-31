import type { ReactNode } from 'react';
import { useKeyHintLabel, useKeyboardHints } from './keyboardHintsContext';

/** A label rendered inside a panel, for labels its owner computes outside the provider. */
export function KeyHintLabel({ text }: { text: string }) {
  return <>{useKeyHintLabel(text)}</>;
}

/** Renders keyboard- or mouse-only content only where it applies. */
export function KeyboardOnly({ children }: { children: ReactNode }) {
  return useKeyboardHints() ? <>{children}</> : null;
}

/** Renders content that replaces a keyboard or mouse affordance on touch. */
export function TouchOnly({ children }: { children: ReactNode }) {
  return useKeyboardHints() ? null : <>{children}</>;
}
