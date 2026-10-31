import { createContext, useContext } from 'react';

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
