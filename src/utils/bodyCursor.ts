const cursorOwners = new Map<string, string>();

function applyBodyCursor(): void {
  if (typeof document === 'undefined') return;

  const activeCursors = Array.from(cursorOwners.values());
  document.body.style.cursor = activeCursors.at(-1) ?? '';
}

export function setBodyCursor(owner: string, cursor: string): void {
  if (!cursor) {
    clearBodyCursor(owner);
    return;
  }

  cursorOwners.delete(owner);
  cursorOwners.set(owner, cursor);
  applyBodyCursor();
}

export function clearBodyCursor(owner: string): void {
  if (cursorOwners.delete(owner)) {
    applyBodyCursor();
  }
}
