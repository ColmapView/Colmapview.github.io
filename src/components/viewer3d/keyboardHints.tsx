import { createContext, useContext, type ReactNode } from 'react';

/**
 * Whether keyboard and mouse affordances (hotkey suffixes, WASD speed, pointer
 * lock, mouse help) apply. Control buttons provide `false` in touch mode, where
 * they do nothing and only take space.
 */
const KeyboardHintsContext = createContext(true);

export const KeyboardHintsProvider = KeyboardHintsContext.Provider;

export function useKeyboardHints(): boolean {
  return useContext(KeyboardHintsContext);
}

/** Drops single-key hotkey hints such as " (H)" from a label. */
export function stripKeyHints(text: string): string {
  return text.replace(/\s*\([A-Z]\)/g, '');
}

export function useKeyHintLabel(text: string): string {
  return useKeyboardHints() ? text : stripKeyHints(text);
}

/** Renders keyboard- or mouse-only content only where it applies. */
export function KeyboardOnly({ children }: { children: ReactNode }) {
  return useKeyboardHints() ? <>{children}</> : null;
}

/** Renders content that replaces a keyboard or mouse affordance on touch. */
export function TouchOnly({ children }: { children: ReactNode }) {
  return useKeyboardHints() ? null : <>{children}</>;
}
