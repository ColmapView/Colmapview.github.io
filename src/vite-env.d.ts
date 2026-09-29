/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __LOCAL_GSPLAT_WEBGPU_ENABLED__: boolean;

interface ImportMetaEnv {
  readonly VITE_HF_PUBLISH_ENABLED?: string;
  readonly VITE_HF_OAUTH_CLIENT_ID?: string;
  readonly VITE_HF_OAUTH_REDIRECT_URI?: string;
}

// File System Access API types
interface FileSystemHandle {
  kind: 'file' | 'directory';
  name: string;
}

interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file';
  getFile(): Promise<File>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory';
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
}

interface Window {
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
}
