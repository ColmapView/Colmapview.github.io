import { useId } from 'react';
import { controlPanelStyles } from '../../theme';
import { parseUITheme, useUITheme } from '../../theme/uiTheme';

export function ThemeSelect() {
  const id = useId();
  const theme = useUITheme(state => state.theme);
  const setTheme = useUITheme(state => state.setTheme);
  return (
    <div className={controlPanelStyles.row}>
      <label htmlFor={id} className={controlPanelStyles.label}>Theme</label>
      <select id={id} className={controlPanelStyles.selectRight} value={theme}
        onChange={event => setTheme(parseUITheme(event.target.value))}>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="system">System</option>
      </select>
    </div>
  );
}
