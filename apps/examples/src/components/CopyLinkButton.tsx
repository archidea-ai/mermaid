import { useEffect, useState } from 'react';
import { shareUrl } from '../share-link';

type Result = 'idle' | 'copied' | 'failed';

const LABEL: Record<Result, string> = {
  idle: 'Copy link',
  copied: 'Link copied',
  failed: 'Copy failed',
};

/**
 * The address bar already carries the chart, so this is a convenience rather
 * than the mechanism — which is why a clipboard refusal (an insecure context,
 * a denied permission) is reported and then left alone. The link is still right
 * where the browser puts it.
 */
export function CopyLinkButton({ source }: { source: string }) {
  const [result, setResult] = useState<Result>('idle');

  useEffect(() => {
    if (result === 'idle') return;
    const timer = setTimeout(() => setResult('idle'), 2000);
    return () => clearTimeout(timer);
  }, [result]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(source, window.location.href));
      setResult('copied');
    } catch {
      setResult('failed');
    }
  };

  return (
    <button
      type="button"
      className="app__button"
      data-result={result}
      onClick={copy}
      // The name is constant so the control stays findable while its label is
      // busy confirming; the label itself is the live region.
      aria-label="Copy link"
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path
          d="M6.5 9.5a3 3 0 0 0 4.24 0l2-2a3 3 0 1 0-4.24-4.24l-.9.9M9.5 6.5a3 3 0 0 0-4.24 0l-2 2a3 3 0 1 0 4.24 4.24l.9-.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <span aria-live="polite">{LABEL[result]}</span>
    </button>
  );
}
