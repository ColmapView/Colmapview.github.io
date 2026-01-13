import { Group, Panel, Separator } from 'react-resizable-panels';
import { StatusBar } from './StatusBar';
import { Scene3D } from '../viewer3d';
import { ImageGallery } from '../gallery/ImageGallery';
import { ImageDetailModal } from '../modals/ImageDetailModal';

export function AppLayout() {
  return (
    <div className="h-screen flex flex-col bg-ds-primary">
      <Group orientation="horizontal" className="flex-1">
        <Panel defaultSize={60} minSize={30}>
          <Scene3D />
        </Panel>

        <Separator className="w-1 bg-ds-tertiary hover:bg-ds-accent transition-colors cursor-col-resize" />

        <Panel defaultSize={40} minSize={20}>
          <ImageGallery />
        </Panel>
      </Group>

      <StatusBar />
      <ImageDetailModal />

      {/* Copyright */}
      <div className="fixed bottom-1 right-2 text-xs text-ds-muted/50 pointer-events-none select-none">
        opsiclear.com © 2026
      </div>
    </div>
  );
}
