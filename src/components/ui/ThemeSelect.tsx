import { useId } from 'react';
import { inputStyles } from '../../theme';
import { parseUITheme, useUITheme } from '../../theme/uiTheme';

export function ThemeSelect() {
  const id = useId();
  const theme = useUITheme(state => state.theme);
  const setTheme = useUITheme(state => state.setTheme);
  return (
    <div className="flex items-center gap-2 text-sm text-ds-secondary">
      <label htmlFor={id}>Theme</label>
      <select id={id} className={`${inputStyles.select} theme-select`} value={theme}
        onChange={event => setTheme(parseUITheme(event.target.value))}>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="system">System</option>
      </select>
    </div>
  );
}
