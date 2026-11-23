import { useId, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { copyToClipboard } from '../../utils/clipboard';
import { getButtonClass, inputStyles } from '../../theme';

const COPY_FIELD_FEEDBACK_DURATION_MS = 2500;

/** A selectable value with copy feedback, including a manual fallback when copying is denied. */
export function CopyableField({ label, value, ref }: { label: string; value: string; ref?: Ref<HTMLDivElement> }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestCopy = useRef(0);
  const [feedback, setFeedback] = useState<{ value: string; copied: boolean; statusMessage: string } | null>(null);
  const current = feedback?.value === value ? feedback : null;
  const statusMessage = current?.statusMessage ?? '';

  if (feedback !== current) {
    setFeedback(null);
  }

  useLayoutEffect(() => () => {
    latestCopy.current += 1;
    clearTimeout(resetTimer.current);
    resetTimer.current = undefined;
  }, [value]);

  const copy = async () => {
    const request = ++latestCopy.current;
    const copied = await copyToClipboard(value);
    if (request !== latestCopy.current) return;

    clearTimeout(resetTimer.current);
    resetTimer.current = undefined;
    if (!copied) {
      setFeedback({ value, copied, statusMessage: '' });
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    setFeedback(previous => ({
      value,
      copied,
      // Alternate the live region text so VoiceOver re-announces repeated copies.
      statusMessage: previous?.statusMessage === 'Copied' ? 'Copied\u00A0' : 'Copied',
    }));
    resetTimer.current = setTimeout(() => {
      resetTimer.current = undefined;
      setFeedback(null);
    }, COPY_FIELD_FEEDBACK_DURATION_MS);
  };
  return <div ref={ref} className="flex flex-col gap-2 min-w-0">
    <div className="flex gap-2 min-w-0">
      <input ref={inputRef} aria-label={label} readOnly value={value} onFocus={event => event.target.select()}
        aria-describedby={current?.copied === false ? `${id}-error` : undefined}
        className={`${inputStyles.base} ${inputStyles.sizes.sm} flex-1 min-w-0 overflow-ellipsis`} />
      <button type="button" className={getButtonClass('primary', 'sm')} onClick={() => { void copy(); }}>
        {current?.copied ? 'Copied' : 'Copy'}
      </button>
      <span aria-live="polite" aria-atomic="true" className="sr-only">{statusMessage}</span>
    </div>
    {current?.copied === false && <p id={`${id}-error`} role="alert" className="m-0 text-sm text-ds-secondary">
      Could not copy. Copy the selected text manually.
    </p>}
  </div>;
}
