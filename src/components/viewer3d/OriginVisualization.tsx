import { useMemo, useState, useCallback } from 'react';
import { type ThreeEvent } from '@react-three/fiber';
import { VIZ_COLORS, hoverCardStyles, ICON_SIZES } from '../../theme';
import type { AxesCoordinateSystem, AxisLabelMode } from '../../store/types';
import { clearBodyCursor, setBodyCursor } from '../../utils/bodyCursor';
import { HoverCard3D } from './HoverCard3D';
import { AxisCylinder, AxisLabel } from './OriginAxisPrimitives';
import { LabelsMenu, SystemMenu, type MenuPosition } from './OriginAxesMenus';
import { COORDINATE_SYSTEM_NAMES, NEGATIVE_AXIS_COLOR } from './originAxesConstants';
import { getAxisPosition, getAxisRotation } from './originAxesGeometry';
import { markSceneContextMenuHandled } from './sceneContextMenuGuard';
import { markSceneObjectTouchDownForTouchPointer } from './frustumTouchGuards';
import { useTrackballDraggingReader } from './trackballControlsApi';
import {
  getNegativeOriginAxisEntries,
  getOriginAxesDimensions,
  getOriginAxesLabelState,
  getOriginAxisDisplayEntries,
} from './originAxesViewModel';
export { OriginGrid } from './OriginGrid';

const ORIGIN_VISUALIZATION_CURSOR_OWNER = 'origin-visualization';

interface OriginAxesProps {
  size: number;
  scale?: number;
  coordinateSystem?: AxesCoordinateSystem;
  labelMode?: AxisLabelMode;
}
// Hovered element type: 'pos-0', 'pos-1', 'pos-2', 'neg-0', 'neg-1', 'neg-2', 'label-0', 'label-1', 'label-2'
type HoveredElement = string | null;

export function OriginAxes({ size, scale = 1, coordinateSystem = 'colmap', labelMode = 'extra' }: OriginAxesProps) {
  const dimensions = getOriginAxesDimensions(size);
  const labelState = getOriginAxesLabelState(labelMode, scale);
  const isDragging = useTrackballDraggingReader();

  // Hover state (managed at parent level like TransformGizmo)
  const [hoveredElement, setHoveredElement] = useState<HoveredElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Menu state - separate for left-click (labels) and right-click (system)
  const [labelsMenu, setLabelsMenu] = useState<MenuPosition | null>(null);
  const [systemMenu, setSystemMenu] = useState<MenuPosition | null>(null);

  // Pointer handlers for hover tracking (same pattern as frustum)
  const handlePointerOver = useCallback((id: string) => (e: ThreeEvent<PointerEvent>) => {
    // Ignore hover during camera orbit/pan
    if (isDragging()) return;
    // Always update hover state - don't block when moving between elements
    setHoveredElement(id);
    setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
    setBodyCursor(ORIGIN_VISUALIZATION_CURSOR_OWNER, 'pointer');
  }, [isDragging]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    // Clear hover state if dragging started while hovering
    if (isDragging()) {
      setHoveredElement((current) => {
        if (current) {
          setMousePos(null);
          clearBodyCursor(ORIGIN_VISUALIZATION_CURSOR_OWNER);
        }
        return null;
      });
      return;
    }
    // Update mouse position if hovering
    setHoveredElement((current) => {
      if (current) {
        setMousePos({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
      }
      return current;
    });
  }, [isDragging]);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    markSceneObjectTouchDownForTouchPointer(e.nativeEvent.pointerType);

    if (e.nativeEvent.button === 2) {
      markSceneContextMenuHandled();
    }
  }, []);

  // Unconditionally clear hover state on pointer out (like CameraFrustums)
  const handlePointerOut = useCallback(() => {
    setHoveredElement(null);
    setMousePos(null);
    clearBodyCursor(ORIGIN_VISUALIZATION_CURSOR_OWNER);
  }, []);

  // Left-click: show labels menu
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setSystemMenu(null);
    setLabelsMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }, []);

  // Right-click: show system menu
  const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    markSceneContextMenuHandled();
    // Also stop native DOM event to prevent global context menu from opening
    e.nativeEvent.stopPropagation();
    e.nativeEvent.preventDefault();
    setLabelsMenu(null);
    setSystemMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }, []);

  const handleCloseLabelsMenu = useCallback(() => {
    setLabelsMenu(null);
  }, []);

  const handleCloseSystemMenu = useCallback(() => {
    setSystemMenu(null);
  }, []);

  const axes = useMemo(() => [
    ...getOriginAxisDisplayEntries(coordinateSystem, {
      x: VIZ_COLORS.axis.x,
      y: VIZ_COLORS.axis.y,
      z: VIZ_COLORS.axis.z,
    }),
  ], [coordinateSystem]);

  const negativeAxes = useMemo(() => getNegativeOriginAxisEntries(axes), [axes]);

  return (
    <group>
      {/* Positive axis lines (colored) */}
      {axes.map((axis, i) => {
        const id = `pos-${i}`;
        const rotation = getAxisRotation(axis.direction);
        const position = getAxisPosition(axis.direction, dimensions.axisLength);
        return (
          <AxisCylinder
            key={id}
            position={position}
            rotation={rotation}
            radius={dimensions.axisRadius}
            length={dimensions.axisLength}
            color={axis.color}
            isHovered={hoveredElement === id}
            onPointerOver={handlePointerOver(id)}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerOut={handlePointerOut}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
          />
        );
      })}
      {/* Negative axis lines (gray, opaque) */}
      {negativeAxes.map((_, i) => {
        const id = `neg-${i}`;
        const axis = negativeAxes[i];
        const rotation = getAxisRotation(axis.direction);
        const position = getAxisPosition(axis.direction, dimensions.negativeAxisLength);
        return (
          <AxisCylinder
            key={id}
            position={position}
            rotation={rotation}
            radius={dimensions.axisRadius * 0.7}
            length={dimensions.negativeAxisLength}
            color={NEGATIVE_AXIS_COLOR}
            isHovered={hoveredElement === id}
            onPointerOver={handlePointerOver(id)}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerOut={handlePointerOut}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
          />
        );
      })}
      {/* Axis labels (billboard text) */}
      {labelState.showLabels && axes.map((axis, i) => {
        const id = `label-${i}`;
        const labelPosition: [number, number, number] = [
          axis.direction[0] * dimensions.labelOffset,
          axis.direction[1] * dimensions.labelOffset,
          axis.direction[2] * dimensions.labelOffset,
        ];
        return (
          <AxisLabel
            key={id}
            position={labelPosition}
            label={axis.label}
            suffix={axis.suffix}
            scaleStr={labelState.scaleLabel}
            showExtra={labelState.showExtra}
            isXAxis={axis.isXAxis}
            color={axis.color}
            fontSize={dimensions.fontSize}
            isHovered={hoveredElement === id}
            onPointerOver={handlePointerOver(id)}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerOut={handlePointerOut}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
          />
        );
      })}
      {/* Hover card popup */}
      {hoveredElement && mousePos && !labelsMenu && !systemMenu && (
        <HoverCard3D mousePos={mousePos} title="Origin Axes" subtitle={COORDINATE_SYSTEM_NAMES[coordinateSystem]}>
          <div className={hoverCardStyles.hint}>
            <div className={hoverCardStyles.hintRow}>
              <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="2" width="12" height="20" rx="6"/>
                <path d="M12 2v8"/>
                <rect x="6" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
              </svg>
              Left: labels
            </div>
            <div className={hoverCardStyles.hintRow}>
              <svg className={ICON_SIZES.hoverCard} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="2" width="12" height="20" rx="6"/>
                <path d="M12 2v8"/>
                <rect x="12" y="2" width="6" height="8" rx="3" fill="currentColor" opacity="0.5"/>
              </svg>
              Right: coord system
            </div>
          </div>
        </HoverCard3D>
      )}
      {/* Labels menu (left-click) */}
      {labelsMenu && (
        <LabelsMenu
          position={labelsMenu}
          currentLabelMode={labelMode}
          onClose={handleCloseLabelsMenu}
        />
      )}
      {/* System menu (right-click) */}
      {systemMenu && (
        <SystemMenu
          position={systemMenu}
          currentSystem={coordinateSystem}
          onClose={handleCloseSystemMenu}
        />
      )}
    </group>
  );
}
