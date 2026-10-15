import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDatasetScopedValue, useFocusOnMount, useFocusWhenBecomesTrue } from './uploadHooks';
import { UploadSubmitRow } from './UploadParts';

afterEach(cleanup);

describe('upload hooks', () => {
  it('keeps an edit only for the dataset it was made for', () => {
    const { result, rerender } = renderHook(({ key, fallback }) => useDatasetScopedValue(key, fallback), { initialProps: { key: 'a', fallback: 'scene' } });
    expect(result.current[0]).toBe('scene');
    act(() => result.current[1]('edited'));
    expect(result.current[0]).toBe('edited');
    rerender({ key: 'b', fallback: 'other' });
    expect(result.current[0]).toBe('other');
  });

  it('focuses the element when the flag turns true, and not when it starts true', () => {
    function Field({ flag }: { flag: boolean }) {
      useFocusWhenBecomesTrue(flag, 'field');
      return <input id="field" aria-label="Field" />;
    }
    const { rerender } = render(<Field flag={true} />);
    expect(screen.getByLabelText('Field')).not.toHaveFocus();
    rerender(<Field flag={false} />);
    rerender(<Field flag={true} />);
    expect(screen.getByLabelText('Field')).toHaveFocus();
  });

  it('focuses an element when it mounts', () => {
    function Status() {
      const ref = useFocusOnMount<HTMLParagraphElement>();
      return <p ref={ref} tabIndex={-1} role="status">Uploading</p>;
    }
    render(<Status />);
    expect(screen.getByRole('status')).toHaveFocus();
  });
});

describe('UploadSubmitRow', () => {
  it('describes the button with the Hub disclosure only when it shows', () => {
    const { rerender } = render(<UploadSubmitRow id="x" note="Sign in to publish." disclosure="Also creates a Hub link." disabled={false} onSubmit={() => {}}>Publish</UploadSubmitRow>);
    expect(screen.getByRole('button', { name: 'Publish' })).toHaveAccessibleDescription('Also creates a Hub link.');
    expect(screen.getByText('Sign in to publish.')).toBeVisible();
    rerender(<UploadSubmitRow id="x" note={false} disclosure={null} disabled onSubmit={() => {}}>Publish</UploadSubmitRow>);
    expect(screen.getByRole('button', { name: 'Publish' })).not.toHaveAttribute('aria-describedby');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });
});
