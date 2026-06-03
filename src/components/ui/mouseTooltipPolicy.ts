import type { CSSProperties } from 'react';
import { MODAL_POSITION, Z_INDEX } from '../../theme';

export type MouseTooltipIconMarker = 'LMB' | 'RMB' | 'SCROLL';

export type MouseTooltipContentPart =
  | { type: 'text'; text: string }
  | { type: 'icon'; marker: MouseTooltipIconMarker; key: string };

export interface MouseTooltipTarget {
  element: HTMLElement;
  text: string | null;
}

export interface MouseTooltipTargetUpdateOptions {
  next: MouseTooltipTarget;
  currentElement: HTMLElement | null;
  currentText: string | null;
}

export interface MouseTooltipPosition {
  x: number;
  y: number;
}

const MOUSE_TOOLTIP_MARKER_PATTERN = /\{(LMB|RMB|SCROLL)\}/g;

function isMouseTooltipIconMarker(value: string | undefined): value is MouseTooltipIconMarker {
  return value === 'LMB' || value === 'RMB' || value === 'SCROLL';
}

export function parseMouseTooltipContent(text: string): MouseTooltipContentPart[] {
  const parts: MouseTooltipContentPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MOUSE_TOOLTIP_MARKER_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    const marker = match[1];
    if (isMouseTooltipIconMarker(marker)) {
      parts.push({
        type: 'icon',
        marker,
        key: `icon-${match.index}`,
      });
    }

    lastIndex = MOUSE_TOOLTIP_MARKER_PATTERN.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', text }];
}

export function getMouseTooltipTarget(target: EventTarget | null): MouseTooltipTarget | null {
  if (typeof Element === 'undefined' || !(target instanceof Element)) {
    return null;
  }

  const element = target.closest('[data-tooltip]');
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  return {
    element,
    text: element.dataset.tooltip || null,
  };
}

export function shouldUpdateMouseTooltipTarget({
  next,
  currentElement,
  currentText,
}: MouseTooltipTargetUpdateOptions): boolean {
  return next.element !== currentElement || next.text !== currentText;
}

export function shouldClearMouseTooltipOnMouseOut(relatedTarget: EventTarget | null): boolean {
  return getMouseTooltipTarget(relatedTarget) === null;
}

export function getMouseTooltipStyle(
  position: MouseTooltipPosition,
  cursorOffset = MODAL_POSITION.cursorOffset,
  zIndex = Z_INDEX.mouseTooltip
): CSSProperties {
  return {
    zIndex,
    right: `calc(100vw - ${position.x}px + ${cursorOffset}px)`,
    top: position.y + cursorOffset,
  };
}
