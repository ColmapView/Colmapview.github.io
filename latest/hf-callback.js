(() => {
  const url = window.location.href;
  const status = document.getElementById('status');
  try {
    const state = JSON.parse(new URL(url).searchParams.get('state') || '{}');
    window.history.replaceState(null, '', window.location.pathname);
    if (typeof state.state !== 'string' || !/^[a-f0-9-]{36}$/.test(state.state)
      || state.redirectUri !== window.location.origin + window.location.pathname) throw new Error('Invalid response');
    const message = { type: 'colmapview:hf-oauth:v1', url };
    if (window.opener) window.opener.postMessage(message, window.location.origin);
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(`colmapview-hf-${state.state}`);
      channel.postMessage(message);
      setTimeout(() => channel.close(), 1000);
    }
    status.textContent = 'Return to ColmapView to finish connecting. You can close this window.';
  } catch {
    window.history.replaceState(null, '', window.location.pathname);
    status.textContent = 'Sign-in could not complete. Return to ColmapView and reconnect.';
  }
})();
