import { Html } from '@react-three/drei';
import { hoverCardStyles, MODAL_POSITION } from '../../theme';

interface HoverCard3DProps {
  mousePos: { x: number; y: number };
  title: string;
  titleStyle?: React.CSSProperties;
  subtitle?: string;
  children?: React.ReactNode;
}

/**
 * Shared 3D hover tooltip rendered via drei's Html component.
 * Follows the cursor with a fixed offset and displays a styled card.
 */
export function HoverCard3D({ mousePos, title, titleStyle, subtitle, children }: HoverCard3DProps) {
  return (
    <Html
      style={{
        position: 'fixed',
        left: mousePos.x + MODAL_POSITION.cursorOffset,
        top: mousePos.y + MODAL_POSITION.cursorOffset,
        pointerEvents: 'none',
        transform: 'none',
      }}
      calculatePosition={() => [0, 0]}
    >
      <div className={hoverCardStyles.container}>
        <div className={hoverCardStyles.title} style={titleStyle}>{title}</div>
        {subtitle && <div className={hoverCardStyles.subtitle}>{subtitle}</div>}
        {children}
      </div>
    </Html>
  );
}
