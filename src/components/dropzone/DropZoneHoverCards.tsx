import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { hoverCardStyles, ICON_SIZES } from '../../theme';
import { MouseLeftIcon, MouseRightIcon } from '../../icons';
import { getClampedTooltipPosition } from '../ui/mouseTooltipPolicy';
import {
  DROP_ZONE_HOVER_CARD_POSITION_CLASS,
  getArchiveUrlCopy,
  getDropZoneHoverCardStyle,
  LOAD_JSON_HINT_ROWS,
  LOAD_JSON_HOVER_CARD_TITLE,
  LOAD_JSON_MANIFEST_EXAMPLE,
  LOAD_URL_DIRECT_EXAMPLE,
  LOAD_URL_HINT_ROWS,
  LOAD_URL_HOVER_CARD_TITLE,
  LOAD_URL_LOCAL_SERVER_HINT,
  LOAD_URL_SUPPORTED_SOURCES,
  type DropZoneHoverCardHintIcon,
  type DropZoneHoverCardHintRow,
} from './dropZoneHoverCardViewModel';

interface DropZoneHoverCardProps {
  anchorRef: RefObject<HTMLButtonElement | null>;
}

interface DropZoneHoverCardShellProps extends DropZoneHoverCardProps {
  children: React.ReactNode;
}

function DropZoneHoverCardShell({ anchorRef, children }: DropZoneHoverCardShellProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const card = cardRef.current;
    const anchor = anchorRef.current;
    if (!card || !anchor) return;
    const measure = () => {
      const bounds = anchor.getBoundingClientRect();
      const size = card.getBoundingClientRect();
      const next = getClampedTooltipPosition(
        { x: bounds.left + (bounds.width - size.width) / 2, y: bounds.top },
        size,
        { width: window.innerWidth, height: window.innerHeight },
        true,
      );
      setPosition(current => current?.left === next.left && current.top === next.top ? current : next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(card);
    observer?.observe(anchor);
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
    };
  }, [anchorRef]);

  // Help must neither enlarge the startup panel's scroll bounds nor block its controls.
  return createPortal(
    <div
      ref={cardRef}
      className={`${DROP_ZONE_HOVER_CARD_POSITION_CLASS} ${hoverCardStyles.container}`}
      style={{ ...getDropZoneHoverCardStyle(), ...position, visibility: position ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}

function renderHintIcon(icon: DropZoneHoverCardHintIcon) {
  return icon === 'mouse-left'
    ? <MouseLeftIcon className={ICON_SIZES.hoverCard} />
    : <MouseRightIcon className={ICON_SIZES.hoverCard} />;
}

function DropZoneHoverCardHintRows({ rows }: { rows: readonly DropZoneHoverCardHintRow[] }) {
  return (
    <div className={hoverCardStyles.hint}>
      {rows.map((row) => (
        <div key={row.label} className={`${hoverCardStyles.hintRow}${row.icon === 'mouse-right' ? ' text-ds-primary font-semibold mt-2' : ''}`}>
          {renderHintIcon(row.icon)}
          {row.label}
        </div>
      ))}
    </div>
  );
}

export function LoadUrlHoverCard({ anchorRef }: DropZoneHoverCardProps) {
  return (
    <DropZoneHoverCardShell anchorRef={anchorRef}>
      <div className={hoverCardStyles.title}>{LOAD_URL_HOVER_CARD_TITLE}</div>
      <div className={`${hoverCardStyles.subtitle} whitespace-pre-wrap mt-1`}>{LOAD_URL_DIRECT_EXAMPLE}</div>
      <div className={`${hoverCardStyles.subtitle} mt-2`}>{getArchiveUrlCopy()}</div>
      <div className={`${hoverCardStyles.subtitle} mt-1 text-ds-muted/70`}>{LOAD_URL_SUPPORTED_SOURCES}</div>
      <div className={`${hoverCardStyles.subtitle} mt-1 text-ds-muted/70`}>{LOAD_URL_LOCAL_SERVER_HINT}</div>
      <DropZoneHoverCardHintRows rows={LOAD_URL_HINT_ROWS} />
    </DropZoneHoverCardShell>
  );
}

export function LoadJsonHoverCard({ anchorRef }: DropZoneHoverCardProps) {
  return (
    <DropZoneHoverCardShell anchorRef={anchorRef}>
      <div className={hoverCardStyles.title}>{LOAD_JSON_HOVER_CARD_TITLE}</div>
      <div className={`${hoverCardStyles.subtitle} whitespace-pre-wrap mt-1 font-mono text-xs`}>
        {LOAD_JSON_MANIFEST_EXAMPLE}
      </div>
      <DropZoneHoverCardHintRows rows={LOAD_JSON_HINT_ROWS} />
    </DropZoneHoverCardShell>
  );
}
