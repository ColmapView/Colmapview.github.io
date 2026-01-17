export type { ColorMode } from '../types/colmap';

// Camera and navigation
export type CameraMode = 'orbit' | 'fly';
export type CameraProjection = 'perspective' | 'orthographic';
export type CameraDisplayMode = 'off' | 'frustum' | 'arrow' | 'imageplane';
export type FrustumColorMode = 'single' | 'byCamera';

export type ImageLoadMode = 'prefetch' | 'lazy' | 'skip';

// Visualization
export type MatchesDisplayMode = 'off' | 'on' | 'blink';
export type SelectionColorMode = 'off' | 'static' | 'blink' | 'rainbow';
export type AxesDisplayMode = 'off' | 'axes' | 'grid' | 'both';
export type AxesCoordinateSystem = 'colmap' | 'opencv' | 'threejs' | 'opengl' | 'vulkan' | 'blender' | 'houdini' | 'unity' | 'unreal';
export type AxisLabelMode = 'off' | 'xyz' | 'extra';
export type GizmoMode = 'off' | 'local' | 'global';

// Export
export type ScreenshotSize = 'current' | '1920x1080' | '1280x720' | '3840x2160' | '1024x1024' | '512x512' | '2048x2048';
export type ScreenshotFormat = 'jpeg' | 'png' | 'webp';
export type ExportFormat = 'text' | 'binary' | 'ply' | 'config';
