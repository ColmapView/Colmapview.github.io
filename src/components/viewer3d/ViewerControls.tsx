import { useState, memo, useCallback } from 'react';
import { useViewerStore } from '../../store';
import type { ColorMode } from '../../types/colmap';

function PointIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="4" />
      <circle cx="5" cy="5" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function MatchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="12" r="3" />
      <path d="M9 12h6" />
    </svg>
  );
}

function RainbowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2">
      <path d="M4 18a8 8 0 0 1 16 0" stroke="#ff0000" />
      <path d="M6 18a6 6 0 0 1 12 0" stroke="#ffff00" />
      <path d="M8 18a4 4 0 0 1 8 0" stroke="#00ff00" />
      <path d="M10 18a2 2 0 0 1 4 0" stroke="#00ffff" />
    </svg>
  );
}

function AxesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20V4M4 12h16" />
      <path d="M12 4l-2 2M12 4l2 2M20 12l-2-2M20 12l-2 2" />
    </svg>
  );
}

function ColorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="8" r="2" fill="#ff6b6b" stroke="none" />
      <circle cx="8" cy="14" r="2" fill="#51cf66" stroke="none" />
      <circle cx="16" cy="14" r="2" fill="#339af0" stroke="none" />
    </svg>
  );
}

function BgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function ResetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

type PanelType = 'points' | 'color' | 'scale' | 'imagePlanes' | 'matches' | 'rainbow' | 'axes' | 'bg' | null;

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

const SliderRow = memo(function SliderRow({ label, value, min, max, step, onChange, formatValue }: SliderRowProps) {
  const displayValue = formatValue ? formatValue(value) : String(value);
  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={styles.slider}
        />
        <span className={styles.value}>{displayValue}</span>
      </div>
    </div>
  );
});

interface PanelWrapperProps {
  title: string;
  children: React.ReactNode;
}

const PanelWrapper = memo(function PanelWrapper({ title, children }: PanelWrapperProps) {
  return (
    <>
      <div className={styles.panelBridge} />
      <div className={styles.panelWrapper}>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{title}</div>
          {children}
        </div>
      </div>
    </>
  );
});

const styles = {
  button: 'w-16 h-16 rounded-lg flex items-center justify-center transition-colors relative',
  buttonActive: 'bg-ds-accent text-ds-void',
  buttonHover: 'bg-ds-hover text-ds-primary',
  buttonInactive: 'bg-ds-void/50 text-ds-secondary hover:bg-ds-void/70 hover:text-ds-primary',
  panelWrapper: 'absolute right-[72px] top-0',
  panelBridge: 'absolute right-16 top-0 w-2 h-16',
  panel: 'bg-ds-tertiary border border-ds rounded-lg p-4 min-w-[220px] shadow-ds-lg',
  panelTitle: 'text-ds-primary text-base font-medium mb-3',
  label: 'text-ds-secondary text-base whitespace-nowrap w-20',
  value: 'text-ds-primary text-base w-8 text-right',
  slider: 'w-28 accent-ds-accent',
  row: 'flex items-center justify-between gap-2',
};

function getButtonClass(isActive: boolean, isHovered: boolean): string {
  if (isActive) return `${styles.button} ${styles.buttonActive}`;
  if (isHovered) return `${styles.button} ${styles.buttonHover}`;
  return `${styles.button} ${styles.buttonInactive}`;
}

interface ControlButtonProps {
  panelId: PanelType;
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  icon: React.ReactNode;
  tooltip: string;
  isActive?: boolean;
  onClick?: () => void;
  panelTitle?: string;
  children?: React.ReactNode;
}

const ControlButton = memo(function ControlButton({
  panelId,
  activePanel,
  setActivePanel,
  icon,
  tooltip,
  isActive = false,
  onClick,
  panelTitle,
  children,
}: ControlButtonProps) {
  const isHovered = activePanel === panelId;
  const hasPanel = panelTitle && children;

  return (
    <div
      className="relative"
      onMouseEnter={() => setActivePanel(panelId)}
      onMouseLeave={() => setActivePanel(null)}
    >
      <button
        onClick={onClick}
        className={getButtonClass(isActive, isHovered)}
        {...(!hasPanel && { 'data-tooltip': tooltip, 'data-tooltip-pos': 'left' })}
      >
        {icon}
      </button>
      {hasPanel && isHovered && (
        <PanelWrapper title={panelTitle}>
          {children}
        </PanelWrapper>
      )}
    </div>
  );
});

export function ViewerControls() {
  const [activePanel, setActivePanel] = useState<PanelType>(null);

  const pointSize = useViewerStore((s) => s.pointSize);
  const setPointSize = useViewerStore((s) => s.setPointSize);
  const colorMode = useViewerStore((s) => s.colorMode);
  const setColorMode = useViewerStore((s) => s.setColorMode);
  const minTrackLength = useViewerStore((s) => s.minTrackLength);
  const setMinTrackLength = useViewerStore((s) => s.setMinTrackLength);
  const showCameras = useViewerStore((s) => s.showCameras);
  const setShowCameras = useViewerStore((s) => s.setShowCameras);
  const cameraScale = useViewerStore((s) => s.cameraScale);
  const setCameraScale = useViewerStore((s) => s.setCameraScale);
  const showImagePlanes = useViewerStore((s) => s.showImagePlanes);
  const setShowImagePlanes = useViewerStore((s) => s.setShowImagePlanes);
  const imagePlaneOpacity = useViewerStore((s) => s.imagePlaneOpacity);
  const setImagePlaneOpacity = useViewerStore((s) => s.setImagePlaneOpacity);
  const showMatches = useViewerStore((s) => s.showMatches);
  const setShowMatches = useViewerStore((s) => s.setShowMatches);
  const matchesOpacity = useViewerStore((s) => s.matchesOpacity);
  const setMatchesOpacity = useViewerStore((s) => s.setMatchesOpacity);
  const rainbowMode = useViewerStore((s) => s.rainbowMode);
  const setRainbowMode = useViewerStore((s) => s.setRainbowMode);
  const rainbowSpeed = useViewerStore((s) => s.rainbowSpeed);
  const setRainbowSpeed = useViewerStore((s) => s.setRainbowSpeed);
  const showAxes = useViewerStore((s) => s.showAxes);
  const setShowAxes = useViewerStore((s) => s.setShowAxes);
  const axesOpacity = useViewerStore((s) => s.axesOpacity);
  const setAxesOpacity = useViewerStore((s) => s.setAxesOpacity);
  const backgroundColor = useViewerStore((s) => s.backgroundColor);
  const setBackgroundColor = useViewerStore((s) => s.setBackgroundColor);
  const resetView = useViewerStore((s) => s.resetView);

  const toggleBackground = useCallback(() => {
    const current = parseInt(backgroundColor.slice(1, 3), 16);
    const newVal = current < 128 ? 'ff' : '00';
    setBackgroundColor(`#${newVal}${newVal}${newVal}`);
  }, [backgroundColor, setBackgroundColor]);

  const handleBrightnessChange = useCallback((v: number) => {
    const hex = Math.round(v).toString(16).padStart(2, '0');
    setBackgroundColor(`#${hex}${hex}${hex}`);
  }, [setBackgroundColor]);

  return (
    <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
      <button
        onClick={resetView}
        className={`${styles.button} ${styles.buttonInactive}`}
        data-tooltip="Reset view"
        data-tooltip-pos="left"
      >
        <ResetIcon className="w-8 h-8" />
      </button>

      <ControlButton
        panelId="points"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<PointIcon className="w-8 h-8" />}
        tooltip="Point settings"
        panelTitle="Points"
      >
        <div className="space-y-2">
          <SliderRow label="Size" value={pointSize} min={1} max={10} step={0.5} onChange={setPointSize} />
          <SliderRow label="Min Track" value={minTrackLength} min={0} max={20} step={1} onChange={(v) => setMinTrackLength(Math.round(v))} />
        </div>
      </ControlButton>

      <ControlButton
        panelId="color"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<ColorIcon className="w-8 h-8" />}
        tooltip="Color mode"
        panelTitle="Color"
      >
        <div className={styles.row}>
          <label className={styles.label}>Mode</label>
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
            className="bg-ds-input text-ds-primary text-base rounded px-2 py-1 border border-ds"
          >
            <option value="rgb">RGB</option>
            <option value="error">Error</option>
            <option value="trackLength">Track Length</option>
          </select>
        </div>
      </ControlButton>

      <ControlButton
        panelId="scale"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<CameraIcon className="w-8 h-8" />}
        tooltip="Cameras"
        isActive={showCameras}
        onClick={() => setShowCameras(!showCameras)}
        panelTitle="Cameras"
      >
        <SliderRow label="Scale" value={cameraScale} min={0.05} max={1} step={0.05} onChange={setCameraScale} formatValue={(v) => v.toFixed(2)} />
      </ControlButton>

      {showCameras && (
        <>
          <ControlButton
            panelId="imagePlanes"
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            icon={<ImageIcon className="w-8 h-8" />}
            tooltip="Image planes"
            isActive={showImagePlanes}
            onClick={() => setShowImagePlanes(!showImagePlanes)}
            panelTitle="Image Planes"
          >
            <SliderRow label="Opacity" value={imagePlaneOpacity} min={0} max={1} step={0.05} onChange={setImagePlaneOpacity} formatValue={(v) => v.toFixed(2)} />
          </ControlButton>

          <ControlButton
            panelId="matches"
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            icon={<MatchIcon className="w-8 h-8" />}
            tooltip="Matches"
            isActive={showMatches}
            onClick={() => setShowMatches(!showMatches)}
            panelTitle="Matches"
          >
            <SliderRow label="Opacity" value={matchesOpacity} min={0} max={1} step={0.05} onChange={setMatchesOpacity} formatValue={(v) => v.toFixed(2)} />
          </ControlButton>

          <ControlButton
            panelId="rainbow"
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            icon={<RainbowIcon className="w-8 h-8" />}
            tooltip="Rainbow mode"
            isActive={rainbowMode}
            onClick={() => setRainbowMode(!rainbowMode)}
            panelTitle="Rainbow"
          >
            <SliderRow label="Speed" value={rainbowSpeed} min={0.1} max={5} step={0.1} onChange={setRainbowSpeed} formatValue={(v) => v.toFixed(1)} />
          </ControlButton>
        </>
      )}

      <ControlButton
        panelId="axes"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<AxesIcon className="w-8 h-8" />}
        tooltip="Axes"
        isActive={showAxes}
        onClick={() => setShowAxes(!showAxes)}
        panelTitle="Axes"
      >
        <SliderRow label="Opacity" value={axesOpacity} min={0} max={1} step={0.05} onChange={setAxesOpacity} formatValue={(v) => v.toFixed(2)} />
      </ControlButton>

      <ControlButton
        panelId="bg"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<BgIcon className="w-8 h-8" />}
        tooltip="Background"
        onClick={toggleBackground}
        panelTitle="Background"
      >
        <SliderRow
          label="Brightness"
          value={parseInt(backgroundColor.slice(1, 3), 16)}
          min={0}
          max={255}
          step={1}
          onChange={handleBrightnessChange}
        />
      </ControlButton>
    </div>
  );
}
