import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (no runtime Google Fonts request; works offline / in embed mode).
// Imported before index.css so the @font-face rules exist when the tokens reference them.
// These entry points ship all six subsets (latin, latin-ext, cyrillic, cyrillic-ext,
// greek, vietnamese); @fontsource-variable v5.3.0 has no per-subset entry point, so
// pruning would mean vendoring upstream @font-face blocks into this repo. Not worth it:
// unicode-range already stops browsers fetching a subset they don't need, so the only
// cost is dist size.
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'
import { initializeUITheme } from './theme/uiTheme'
import { AgentControlDialog, AgentSessionStatus } from './components/agent/AgentControls'
import { disposeCommands } from './commands/runtime'

const disposeUITheme = initializeUITheme();
if (import.meta.hot) import.meta.hot.dispose(disposeUITheme);
if (import.meta.hot) import.meta.hot.dispose(disposeCommands);
import { registerAllCaches } from './cache'

// Register all caches for centralized management
registerAllCaches();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <AgentSessionStatus />
    <AgentControlDialog />
  </StrictMode>,
)
