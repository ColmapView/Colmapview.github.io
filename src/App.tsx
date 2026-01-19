import { HotkeysProvider } from 'react-hotkeys-hook';
import { DropZone } from './components/dropzone';
import { AppLayout } from './components/layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HotkeyHelpModal } from './components/modals/HotkeyHelpModal';
import { MouseTooltip } from './components/ui/MouseTooltip';
import { NotificationContainer } from './components/ui/NotificationContainer';
import { initStoreMigration } from './store';

// Run store migration on app startup (migrates from old monolithic store to domain stores)
initStoreMigration();

function App() {
  return (
    <ErrorBoundary>
      <HotkeysProvider initiallyActiveScopes={['global', 'viewer']}>
        <DropZone>
          <AppLayout />
        </DropZone>
        <HotkeyHelpModal />
        <MouseTooltip />
        <NotificationContainer />
      </HotkeysProvider>
    </ErrorBoundary>
  );
}

export default App;
