export interface CapturedPointerDragStartEvent {
  currentTarget: HTMLElement;
  pointerId: number;
  preventDefault: () => void;
  stopPropagation?: () => void;
}

interface CapturedPointerDragOptions {
  event: CapturedPointerDragStartEvent;
  onMove: (event: PointerEvent) => void;
  onEnd?: () => void;
  stopPropagation?: boolean;
}

export function startCapturedPointerDrag({
  event,
  onMove,
  onEnd,
  stopPropagation = false,
}: CapturedPointerDragOptions): void {
  event.preventDefault();
  if (stopPropagation) {
    event.stopPropagation?.();
  }

  const element = event.currentTarget;
  element.setPointerCapture(event.pointerId);

  const onUp = () => {
    element.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerup', onUp);
    onEnd?.();
  };

  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
}
