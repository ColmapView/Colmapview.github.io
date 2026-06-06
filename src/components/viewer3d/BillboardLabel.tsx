import { Billboard } from '@react-three/drei';
import { CANVAS_COLORS } from '../../theme';
import { CanvasTextSprite } from './CanvasTextSprite';

interface BillboardLabelProps {
  label: string;
  suffix?: string;
  fontSize: number;
  color: string | number;
  position?: [number, number, number];
  anchorX?: 'center' | 'left' | 'right';
}

/**
 * Shared billboard text with outline and optional parenthesized suffix.
 * Used by origin axes labels and floor plane axis labels.
 */
export function BillboardLabel({ label, suffix, fontSize, color, position, anchorX = 'right' }: BillboardLabelProps) {
  const hasSuffix = !!suffix;

  return (
    <Billboard position={position} follow={true}>
      <group>
        <CanvasTextSprite
          text={label}
          fontSize={fontSize}
          color={color}
          anchorX={hasSuffix ? 'right' : anchorX}
          outlineWidth={fontSize * 0.08}
          outlineColor={CANVAS_COLORS.outline}
          outlineOpacity={0.5}
        />
        {hasSuffix && (
          <CanvasTextSprite
            text={`(${suffix})`}
            fontSize={fontSize * 0.6}
            color={color}
            anchorX="left"
            position={[fontSize * 0.15, 0, 0]}
            outlineWidth={fontSize * 0.05}
            outlineColor={CANVAS_COLORS.outline}
            outlineOpacity={0.5}
          />
        )}
      </group>
    </Billboard>
  );
}
