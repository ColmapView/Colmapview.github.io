interface MediaLoadErrorProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

export function MediaLoadError({ message, retryLabel, onRetry }: MediaLoadErrorProps) {
  return (
    <div role="alert" className="flex flex-shrink-0 items-center justify-between gap-2 rounded border border-ds bg-ds-tertiary px-3 py-1 text-xs text-ds-primary">
      <span>{message}</span>
      <button className="flex-shrink-0 rounded px-2 py-2 underline hover-ds-hover" aria-label={retryLabel} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
