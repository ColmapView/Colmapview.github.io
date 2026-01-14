import { Group, Panel, Separator } from 'react-resizable-panels';
import { StatusBar } from './StatusBar';
import { Scene3D } from '../viewer3d';
import { ImageGallery } from '../gallery/ImageGallery';
import { ImageDetailModal } from '../modals/ImageDetailModal';
import { separatorStyles } from '../../theme';

export function AppLayout() {
  return (
    <div className="h-screen flex flex-col bg-ds-primary">
      <Group orientation="horizontal" className="flex-1">
        <Panel defaultSize={70} minSize={30}>
          <Scene3D />
        </Panel>

        <Separator className={separatorStyles.vertical} />

        <Panel defaultSize={30} minSize={20}>
          <ImageGallery />
        </Panel>
      </Group>

      <StatusBar />
      <ImageDetailModal />
    </div>
  );
}
