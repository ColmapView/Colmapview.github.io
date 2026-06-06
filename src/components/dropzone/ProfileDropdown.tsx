/**
 * Simple profile dropdown for the loading screen.
 * Only allows selecting/loading profiles, not saving.
 */

import { useState, useCallback, useRef } from 'react';
import { useProfiles } from '../../hooks/useProfiles';
import { useClickOutside } from '../../hooks/useClickOutside';
import { ChevronDownIcon } from '../../icons';
import { buttonStyles } from '../../theme';
import {
  getProfileDropdownButtonLabel,
  getProfileDropdownChevronClass,
  getProfileDropdownMenuStyle,
  getProfileDropdownOptionRows,
  PROFILE_DROPDOWN_MENU_CLASS,
  PROFILE_DROPDOWN_TOOLTIP,
} from './profileDropdownViewModel';

export function ProfileDropdown() {
  const {
    profileNames,
    activeProfile,
    loadProfile,
  } = useProfiles();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside or pressing Escape
  const handleClose = useCallback(() => setIsOpen(false), []);
  useClickOutside(dropdownRef, handleClose, isOpen);

  const handleSelect = useCallback((name: string) => {
    loadProfile(name);
    setIsOpen(false);
  }, [loadProfile]);

  const profileRows = getProfileDropdownOptionRows(profileNames, activeProfile);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`${buttonStyles.base} ${buttonStyles.variants.ghost} h-8 px-2 gap-1`}
        data-tooltip={PROFILE_DROPDOWN_TOOLTIP}
      >
        <span className="text-sm truncate max-w-[80px]">{getProfileDropdownButtonLabel(activeProfile)}</span>
        <ChevronDownIcon className={getProfileDropdownChevronClass(isOpen)} />
      </button>

      {isOpen && (
        <div
          className={PROFILE_DROPDOWN_MENU_CLASS}
          style={getProfileDropdownMenuStyle()}
          data-idle-pause="true"
        >
          {profileRows.map((row) => (
            <button
              type="button"
              key={row.name}
              onClick={() => handleSelect(row.name)}
              className={row.className}
              aria-current={row.isActive ? 'true' : undefined}
            >
              {row.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
