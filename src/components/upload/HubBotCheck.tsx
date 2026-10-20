import { useEffect, useRef, useState } from 'react';

interface TurnstileApi {
  render(element: HTMLElement, options: { sitekey: string; action: string; callback: (token: string) => void;
    'expired-callback': () => void; 'error-callback': () => void; theme: 'auto'; size: 'normal' | 'compact' }): string;
  remove(id: string): void;
}
const browser = window as Window & { turnstile?: TurnstileApi };
const scriptId = 'colmapview-turnstile';
let loaded: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (browser.turnstile) return Promise.resolve();
  if (loaded) return loaded;
  loaded = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.id = scriptId;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
    const finish = (success: boolean) => {
      window.clearTimeout(timer);
      script.onload = null; script.onerror = null;
      if (success) resolve();
      else { script.remove(); reject(new Error('Bot check did not load.')); }
    };
    const timer = window.setTimeout(() => finish(false), 15000);
    script.onload = () => finish(Boolean(browser.turnstile));
    script.onerror = () => finish(false);
    document.head.append(script);
  }).catch((error: unknown) => { loaded = null; throw error; });
  return loaded;
}

/** Standard managed Turnstile; only its one-use response is sent to the Hub. */
export function HubBotCheck({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const element = container.current;
    const resize = () => setCompact(element.clientWidth < 300);
    resize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(resize); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    let widget: string | undefined;
    void loadTurnstile().then(() => {
      if (!active || !container.current || !browser.turnstile) return;
      onToken(null);
      widget = browser.turnstile.render(container.current, { sitekey: siteKey, action: 'hub-publication', theme: 'auto', size: compact ? 'compact' : 'normal',
        callback: token => { if (active) { setError(false); onToken(token); } },
        'expired-callback': () => { if (active) onToken(null); },
        'error-callback': () => { if (active) { setError(true); onToken(null); } },
      });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (widget && browser.turnstile) browser.turnstile.remove(widget); };
  }, [siteKey, onToken, compact]);
  return <div className="publication-bot-check"><div ref={container} />{error && <p role="alert">The bot check could not load. Reopen this dialog to try again.</p>}</div>;
}
