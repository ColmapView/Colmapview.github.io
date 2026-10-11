import { useId, useRef, useState } from 'react';
import { copyToClipboard } from '../../utils/clipboard';
import { getButtonClass, inputStyles } from '../../theme';

/** A selectable value with copy feedback, including a manual fallback when copying is denied. */
export function CopyableField({ label, value }: { label: string; value: string }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<{ value: string; copied: boolean } | null>(null);
  const current = feedback?.value === value ? feedback : null;
  const copy = async () => {
    const copied = await copyToClipboard(value);
    setFeedback({ value, copied });
    if (!copied) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };
  return <div className="flex flex-col gap-2 min-w-0">
    <div className="flex gap-2 min-w-0">
      <input ref={inputRef} aria-label={label} readOnly value={value} onFocus={event => event.target.select()}
        aria-describedby={current?.copied === false ? `${id}-error` : undefined}
        className={`${inputStyles.base} ${inputStyles.sizes.sm} flex-1 min-w-0 overflow-ellipsis`} />
      <button type="button" className={getButtonClass('primary', 'sm')} aria-live="polite" onClick={() => { void copy(); }}>
        {current?.copied ? 'Copied' : 'Copy'}
      </button>
    </div>
    {current?.copied === false && <p id={`${id}-error`} role="alert" className="m-0 text-sm text-ds-secondary">
      Could not copy. Copy the selected text manually.
    </p>}
  </div>;
}
