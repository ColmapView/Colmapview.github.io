import { useState, memo, useCallback } from 'react';
import { useViewerStore } from '../../store';
import type { ColorMode } from '../../types/colmap';
import type { CameraMode } from '../../store/viewerStore';
import { BRIGHTNESS, getTooltipProps, controlPanelStyles, getControlButtonClass } from '../../theme';

function PointIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="8" r="2.5" opacity="0.9" />
      <circle cx="7" cy="13" r="2" opacity="0.7" />
      <circle cx="17" cy="12" r="2.2" opacity="0.8" />
      <circle cx="10" cy="17" r="1.8" opacity="0.6" />
      <circle cx="15" cy="17" r="1.5" opacity="0.5" />
      <circle cx="5" cy="8" r="1.2" opacity="0.4" />
      <circle cx="19" cy="7" r="1" opacity="0.35" />
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
    <svg className={className} viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round">
      <path d="M3 17a9 9 0 0 1 18 0" stroke="#e74c3c" />
      <path d="M5 17a7 7 0 0 1 14 0" stroke="#f39c12" />
      <path d="M7 17a5 5 0 0 1 10 0" stroke="#2ecc71" />
      <path d="M9 17a3 3 0 0 1 6 0" stroke="#3498db" />
      <path d="M11 17a1 1 0 0 1 2 0" stroke="#9b59b6" />
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
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 5.5a6.5 6.5 0 0 1 0 13" fill="#e74c3c" />
      <path d="M12 5.5a6.5 6.5 0 0 0 0 13" fill="#3498db" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
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

function OrbitIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.2" />
      <circle cx="12" cy="12" r="4" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" />
      <circle cx="20" cy="10" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FlyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L12 22M12 2L8 6M12 2L16 6" />
      <path d="M5 12L19 12M5 12L9 8M5 12L9 16" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

type PanelType = 'points' | 'color' | 'scale' | 'imagePlanes' | 'matches' | 'rainbow' | 'axes' | 'bg' | 'camera' | null;

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
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={styles.slider}
        style={{ '--range-progress': `${progress}%` } as React.CSSProperties}
      />
      <span className={styles.value}>{displayValue}</span>
    </div>
  );
});

interface SelectRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

const SelectRow = memo(function SelectRow({ label, value, onChange, options }: SelectRowProps) {
  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.select}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <span className={styles.value} />
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

// Use centralized styles from theme
const styles = controlPanelStyles;

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
        className={getControlButtonClass(isActive, isHovered)}
        {...(!hasPanel && getTooltipProps(tooltip, 'left'))}
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
  const cameraMode = useViewerStore((s) => s.cameraMode);
  const setCameraMode = useViewerStore((s) => s.setCameraMode);
  const flySpeed = useViewerStore((s) => s.flySpeed);
  const setFlySpeed = useViewerStore((s) => s.setFlySpeed);

  const toggleBackground = useCallback(() => {
    const current = parseInt(backgroundColor.slice(1, 3), 16);
    const newVal = current < BRIGHTNESS.midpoint ? 'ff' : '00';
    setBackgroundColor(`#${newVal}${newVal}${newVal}`);
  }, [backgroundColor, setBackgroundColor]);

  const handleBrightnessChange = useCallback((v: number) => {
    const hex = Math.round(v).toString(16).padStart(2, '0');
    setBackgroundColor(`#${hex}${hex}${hex}`);
  }, [setBackgroundColor]);

  const toggleCameraMode = useCallback(() => {
    setCameraMode(cameraMode === 'orbit' ? 'fly' : 'orbit');
  }, [cameraMode, setCameraMode]);

  return (
    <div className={styles.container}>
      <button
        onClick={resetView}
        className={`${styles.button} ${styles.buttonInactive}`}
        {...getTooltipProps('Reset view', 'left')}
      >
        <ResetIcon className="w-6 h-6" />
      </button>

      <ControlButton
        panelId="camera"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={cameraMode === 'orbit' ? <OrbitIcon className="w-6 h-6" /> : <FlyIcon className="w-6 h-6" />}
        tooltip={cameraMode === 'orbit' ? 'Switch to Fly mode' : 'Switch to Orbit mode'}
        isActive={cameraMode === 'fly'}
        onClick={toggleCameraMode}
        panelTitle="Camera Mode"
      >
        <div className={styles.panelContent}>
          <SelectRow
            label="Mode"
            value={cameraMode}
            onChange={(v) => setCameraMode(v as CameraMode)}
            options={[
              { value: 'orbit', label: 'Orbit' },
              { value: 'fly', label: 'Fly' },
            ]}
          />
          <SliderRow label="Speed" value={flySpeed} min={0.1} max={5} step={0.1} onChange={setFlySpeed} formatValue={(v) => v.toFixed(1)} />
          <div className="text-ds-secondary text-sm mt-3">
            <div className="mb-1 font-medium">Keyboard:</div>
            <div>WASD / Arrows: Move</div>
            <div>Q: Down, E/Space: Up</div>
            <div>Shift: Speed boost</div>
            {cameraMode === 'fly' && (
              <>
                <div className="mt-1 font-medium">Mouse:</div>
                <div>Drag: Look around</div>
                <div>Scroll: Move forward/back</div>
              </>
            )}
          </div>
        </div>
      </ControlButton>

      <ControlButton
        panelId="points"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<PointIcon className="w-6 h-6" />}
        tooltip="Point settings"
        panelTitle="Point Cloud"
      >
        <div className={styles.panelContent}>
          <SliderRow label="Size" value={pointSize} min={1} max={10} step={0.5} onChange={setPointSize} />
          <SliderRow label="Min Track" value={minTrackLength} min={0} max={20} step={1} onChange={(v) => setMinTrackLength(Math.round(v))} />
        </div>
      </ControlButton>

      <ControlButton
        panelId="color"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<ColorIcon className="w-6 h-6" />}
        tooltip="Color mode"
        panelTitle="Color Mode"
      >
        <SelectRow
          label="Mode"
          value={colorMode}
          onChange={(v) => setColorMode(v as ColorMode)}
          options={[
            { value: 'rgb', label: 'RGB' },
            { value: 'error', label: 'Error' },
            { value: 'trackLength', label: 'Track Length' },
          ]}
        />
      </ControlButton>

      <ControlButton
        panelId="scale"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<CameraIcon className="w-6 h-6" />}
        tooltip="Camera Frustum"
        isActive={showCameras}
        onClick={() => setShowCameras(!showCameras)}
        panelTitle="Camera Frustum"
      >
        <SliderRow label="Scale" value={cameraScale} min={0.05} max={1} step={0.05} onChange={setCameraScale} formatValue={(v) => v.toFixed(2)} />
      </ControlButton>

      {showCameras && (
        <>
          <ControlButton
            panelId="imagePlanes"
            activePanel={activePanel}
            setActivePanel={setActivePanel}
            icon={<ImageIcon className="w-6 h-6" />}
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
            icon={<MatchIcon className="w-6 h-6" />}
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
            icon={<RainbowIcon className="w-6 h-6" />}
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
        icon={<AxesIcon className="w-6 h-6" />}
        tooltip="Global Axes"
        isActive={showAxes}
        onClick={() => setShowAxes(!showAxes)}
        panelTitle="Global Axes"
      >
        <SliderRow label="Opacity" value={axesOpacity} min={0} max={1} step={0.05} onChange={setAxesOpacity} formatValue={(v) => v.toFixed(2)} />
      </ControlButton>

      <ControlButton
        panelId="bg"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<BgIcon className="w-6 h-6" />}
        tooltip="Background color"
        onClick={toggleBackground}
        panelTitle="Background Color"
      >
        <SliderRow
          label="Brightness"
          value={parseInt(backgroundColor.slice(1, 3), 16)}
          min={0}
          max={BRIGHTNESS.max}
          step={1}
          onChange={handleBrightnessChange}
        />
      </ControlButton>
    </div>
  );
}
