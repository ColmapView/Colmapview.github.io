/**
 * Simple profile dropdown for the loading screen.
 * Only allows selecting/loading profiles, not saving.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useProfiles } from '../../hooks/useProfiles';
import { ChevronDownIcon } from '../../icons';
import { buttonStyles } from '../../theme';

export function ProfileDropdown() {
  const {
    profileNames,
    activeProfile,
    loadProfile,
  } = useProfiles();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = useCallback((name: string) => {
    loadProfile(name);
    setIsOpen(false);
  }, [loadProfile]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${buttonStyles.base} ${buttonStyles.variants.ghost} h-8 px-2 gap-1`}
        data-tooltip="Select settings profile"
      >
        <span className="text-sm truncate max-w-[80px]">{activeProfile || 'Profile'}</span>
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-ds-tertiary border border-ds rounded shadow-lg z-50 min-w-[120px] py-1">
          {profileNames.map((name) => (
            <div
              key={name}
              onClick={() => handleSelect(name)}
              className={`px-3 py-1.5 cursor-pointer hover-ds-hover text-sm ${
                name === activeProfile ? 'bg-ds-hover text-ds-accent' : 'text-ds-primary'
              }`}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
