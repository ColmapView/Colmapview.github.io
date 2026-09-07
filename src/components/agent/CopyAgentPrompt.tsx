import { useId, useState } from 'react';
import { buttonStyles, hoverCardStyles, inputStyles, Z_INDEX } from '../../theme';
import { copyToClipboard } from '../../utils/clipboard';
import { publicAsset } from '../../utils/paths';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { AgentIcon } from '../../icons';

import { buildAgentPrompt } from './agentPrompt';

export function CopyAgentPrompt() {
  const [copyFailed, setCopyFailed] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const helpId = useId();
  return <div className="relative w-full text-center"
    onMouseEnter={() => setShowHelp(true)} onMouseLeave={() => setShowHelp(false)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setShowHelp(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && showHelp) { setShowHelp(false); event.stopPropagation(); }
    }}>
    <button type="button" className={`${buttonStyles.base} ${buttonStyles.sizes.action} ${buttonStyles.variants.secondary} w-full`}
      aria-describedby={showHelp ? helpId : undefined} onFocus={() => setShowHelp(true)}
      onClick={async () => {
        const text = buildAgentPrompt(window.location.href, publicAsset('agent-guide.html'));
        setPrompt(text);
        const copied = await copyToClipboard(text);
        setCopyFailed(!copied);
        setShowHelp(false);
        useNotificationStore.getState().addNotification(copied ? 'info' : 'warning',
          copied ? 'Agent prompt copied — paste into your agent.' : 'Copy unavailable. Select and copy the prompt below the button.');
      }}><AgentIcon className="w-4 h-4" />Agent</button>
    {showHelp && <div className="absolute right-0 bottom-full pb-2" style={{ zIndex: Z_INDEX.dropdown, width: 'min(320px, calc(100vw - 48px))' }}>
      <div id={helpId} role="tooltip" className={`${hoverCardStyles.container} text-left`} style={{ whiteSpace: 'normal' }}>
        <div className={hoverCardStyles.title}>Use ColmapView with your agent</div>
        <div className={`${hoverCardStyles.subtitle} mt-2`}>1. Click to copy this page’s link and connection instructions.</div>
        <div className={`${hoverCardStyles.subtitle} mt-2`}>2. Paste into your agent and say what you want, such as “load my dataset and rotate the scene.”</div>
        <div className={`${hoverCardStyles.subtitle} mt-2`}>3. Follow its setup steps, then paste its pairing code in Settings → Agent controls → Connect MCP.</div>
        <div className={`${hoverCardStyles.hint}`}>Once paired, your agent can load dataset URLs, move the camera and adjust settings. Use Stop agent to end access.</div>
      </div>
    </div>}
    {copyFailed && <textarea aria-label="Agent prompt" readOnly value={prompt} rows={6}
      className={`${inputStyles.base} w-full mt-2`} onFocus={event => event.currentTarget.select()} />}
  </div>;
}
