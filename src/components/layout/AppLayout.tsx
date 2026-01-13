import { Group, Panel, Separator } from 'react-resizable-panels';
import { StatusBar } from './StatusBar';
import { Scene3D } from '../viewer3d';
import { ImageGallery } from '../gallery/ImageGallery';
import { ImageDetailModal } from '../modals/ImageDetailModal';

export function AppLayout() {
  return (
    <div className="h-screen flex flex-col bg-ds-primary">
      {/* Main Content */}
      <Group orientation="horizontal" className="flex-1">
        {/* 3D Viewer Panel */}
        <Panel defaultSize={60} minSize={30}>
          <Scene3D />
        </Panel>

        <Separator className="w-1 bg-ds-tertiary hover:bg-ds-accent transition-colors cursor-col-resize" />

        {/* Right Panel - Image Gallery */}
        <Panel defaultSize={40} minSize={20}>
          <ImageGallery />
        </Panel>
      </Group>

      {/* Status Bar */}
      <StatusBar />

      {/* Modals */}
      <ImageDetailModal />
    </div>
  );
}
