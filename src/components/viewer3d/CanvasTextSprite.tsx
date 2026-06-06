import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';

type TextAnchorX = 'center' | 'left' | 'right';

interface CanvasTextSpriteProps {
  text: string;
  fontSize: number;
  color: string | number;
  position?: [number, number, number];
  anchorX?: TextAnchorX;
  outlineWidth?: number;
  outlineColor?: string | number;
  outlineOpacity?: number;
}

const TEXT_CANVAS_FONT_SIZE = 96;
const TEXT_CANVAS_PADDING_RATIO = 0.25;
const TEXT_CANVAS_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function toCanvasColor(value: string | number, opacity = 1): string {
  const color = new THREE.Color(value);
  const r = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
  const g = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
  const b = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
  return opacity >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getSpriteAnchorX(anchorX: TextAnchorX): number {
  if (anchorX === 'left') return 0;
  if (anchorX === 'right') return 1;
  return 0.5;
}

export const CanvasTextSprite = memo(function CanvasTextSprite({
  text,
  fontSize,
  color,
  position,
  anchorX = 'center',
  outlineWidth = 0,
  outlineColor = '#000000',
  outlineOpacity = 1,
}: CanvasTextSpriteProps) {
  const { texture, worldWidth, worldHeight } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context || fontSize <= 0 || text.length === 0) {
      const emptyTexture = new THREE.CanvasTexture(canvas);
      return { texture: emptyTexture, worldWidth: 0, worldHeight: 0 };
    }

    const font = `600 ${TEXT_CANVAS_FONT_SIZE}px ${TEXT_CANVAS_FONT_FAMILY}`;
    context.font = font;
    const metrics = context.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent || TEXT_CANVAS_FONT_SIZE * 0.8;
    const descent = metrics.actualBoundingBoxDescent || TEXT_CANVAS_FONT_SIZE * 0.2;
    const textHeight = Math.max(1, ascent + descent);
    const outlinePixels = Math.max(0, outlineWidth / fontSize * TEXT_CANVAS_FONT_SIZE);
    const padding = Math.ceil(TEXT_CANVAS_FONT_SIZE * TEXT_CANVAS_PADDING_RATIO + outlinePixels);

    canvas.width = Math.max(1, Math.ceil(metrics.width + padding * 2));
    canvas.height = Math.max(1, Math.ceil(textHeight + padding * 2));

    context.font = font;
    context.textBaseline = 'alphabetic';
    context.lineJoin = 'round';
    context.miterLimit = 2;

    const x = padding;
    const y = padding + ascent;
    if (outlinePixels > 0) {
      context.lineWidth = outlinePixels * 2;
      context.strokeStyle = toCanvasColor(outlineColor, outlineOpacity);
      context.strokeText(text, x, y);
    }
    context.fillStyle = toCanvasColor(color);
    context.fillText(text, x, y);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const worldHeight = fontSize * canvas.height / textHeight;
    const worldWidth = worldHeight * canvas.width / canvas.height;
    return { texture, worldWidth, worldHeight };
  }, [color, fontSize, outlineColor, outlineOpacity, outlineWidth, text]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite
      position={position}
      scale={[worldWidth, worldHeight, 1]}
      center={[getSpriteAnchorX(anchorX), 0.5]}
    >
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
      />
    </sprite>
  );
});
