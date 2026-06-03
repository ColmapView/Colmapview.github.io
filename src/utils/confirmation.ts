export interface ConfirmationRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  size?: 'compact' | 'default';
}

type ConfirmationHandler = (request: ConfirmationRequest) => Promise<boolean>;

let confirmationHandler: ConfirmationHandler | null = null;

export function registerConfirmationHandler(handler: ConfirmationHandler | null): void {
  confirmationHandler = handler;
}

export function requestConfirmation(request: ConfirmationRequest): Promise<boolean> {
  if (confirmationHandler) {
    return confirmationHandler(request);
  }

  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  const prompt = `${request.title}\n\n${request.message}`;
  return Promise.resolve(window.confirm(prompt));
}
