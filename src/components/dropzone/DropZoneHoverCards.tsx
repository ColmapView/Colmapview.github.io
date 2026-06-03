import { hoverCardStyles, ICON_SIZES } from '../../theme';
import { MouseLeftIcon, MouseRightIcon } from '../../icons';
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
  TOY_HINT_ROWS,
  TOY_HOVER_CARD_INCLUDES,
  TOY_HOVER_CARD_SOURCE,
  TOY_HOVER_CARD_SUBTITLE,
  TOY_HOVER_CARD_TITLE,
  type DropZoneHoverCardHintIcon,
  type DropZoneHoverCardHintRow,
} from './dropZoneHoverCardViewModel';

interface DropZoneHoverCardShellProps {
  children: React.ReactNode;
}

function DropZoneHoverCardShell({ children }: DropZoneHoverCardShellProps) {
  return (
    <div
      className={`${DROP_ZONE_HOVER_CARD_POSITION_CLASS} ${hoverCardStyles.container}`}
      style={getDropZoneHoverCardStyle()}
    >
      {children}
    </div>
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
        <div key={row.label} className={hoverCardStyles.hintRow}>
          {renderHintIcon(row.icon)}
          {row.label}
        </div>
      ))}
    </div>
  );
}

export function LoadUrlHoverCard() {
  return (
    <DropZoneHoverCardShell>
      <div className={hoverCardStyles.title}>{LOAD_URL_HOVER_CARD_TITLE}</div>
      <div className={`${hoverCardStyles.subtitle} whitespace-pre mt-1`}>{LOAD_URL_DIRECT_EXAMPLE}</div>
      <div className={`${hoverCardStyles.subtitle} mt-2`}>{getArchiveUrlCopy()}</div>
      <div className={`${hoverCardStyles.subtitle} mt-1 text-ds-muted/70`}>{LOAD_URL_SUPPORTED_SOURCES}</div>
      <div className={`${hoverCardStyles.subtitle} mt-1 text-ds-muted/70`}>{LOAD_URL_LOCAL_SERVER_HINT}</div>
      <DropZoneHoverCardHintRows rows={LOAD_URL_HINT_ROWS} />
    </DropZoneHoverCardShell>
  );
}

export function LoadJsonHoverCard() {
  return (
    <DropZoneHoverCardShell>
      <div className={hoverCardStyles.title}>{LOAD_JSON_HOVER_CARD_TITLE}</div>
      <div className={`${hoverCardStyles.subtitle} whitespace-pre mt-1 font-mono text-xs`}>
        {LOAD_JSON_MANIFEST_EXAMPLE}
      </div>
      <DropZoneHoverCardHintRows rows={LOAD_JSON_HINT_ROWS} />
    </DropZoneHoverCardShell>
  );
}

export function ToyHoverCard() {
  return (
    <DropZoneHoverCardShell>
      <div className={hoverCardStyles.title}>{TOY_HOVER_CARD_TITLE}</div>
      <div className={hoverCardStyles.subtitle}>{TOY_HOVER_CARD_SUBTITLE}</div>
      <div className={`${hoverCardStyles.subtitle} text-ds-muted/70`}>{TOY_HOVER_CARD_SOURCE}</div>
      <div className={`${hoverCardStyles.subtitle} mt-1`}>{TOY_HOVER_CARD_INCLUDES}</div>
      <DropZoneHoverCardHintRows rows={TOY_HINT_ROWS} />
    </DropZoneHoverCardShell>
  );
}
