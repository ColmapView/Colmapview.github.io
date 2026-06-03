import { memo } from 'react';
import { useThumbnail } from '../../hooks/useThumbnail';
import { ResetIcon } from '../../icons';
import { getDeletionThumbnailImageStyle } from './deletionModalViewModel';

interface DeletionModalListItemProps {
  id: number;
  label: string;
  name: string;
  file: File | undefined;
  onView: (id: number) => void;
  onRestore: (id: number) => void;
}

export const DeletionModalListItem = memo(function DeletionModalListItem({
  id,
  label,
  name,
  file,
  onView,
  onRestore,
}: DeletionModalListItemProps) {
  const src = useThumbnail(file, name, true);

  return (
    <tr className="hover-ds-tertiary-50">
      <td className="px-2 py-0.5 align-middle">
        <div className="w-7 h-7 rounded overflow-hidden relative bg-ds-tertiary">
          {src ? (
            <img
              src={src}
              alt={name}
              className="w-full h-full object-cover"
              style={getDeletionThumbnailImageStyle()}
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ds-muted text-[8px]">
              {id}
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="0" y1="0" x2="100" y2="100" stroke="var(--bg-primary)" strokeWidth="3" />
              <line x1="100" y1="0" x2="0" y2="100" stroke="var(--bg-primary)" strokeWidth="3" />
            </svg>
          </div>
        </div>
      </td>
      <td className="px-2 py-0.5 align-middle text-ds-secondary whitespace-nowrap">
        {label}
      </td>
      <td className="px-2 py-0.5 align-middle min-w-0">
        <button
          onClick={() => onView(id)}
          className="w-full text-left text-ds-primary hover:text-ds-accent truncate"
          title={`View ${name}`}
          aria-label={`View ${name}`}
        >
          {name}
        </button>
      </td>
      <td className="px-1 py-0.5 align-middle text-right">
        <button
          onClick={() => onRestore(id)}
          className="text-ds-success hover:bg-ds-success/20 p-1 rounded"
          title="Restore"
          aria-label={`Restore ${name}`}
        >
          <ResetIcon className="w-3 h-3" />
        </button>
      </td>
    </tr>
  );
});
