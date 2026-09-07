import { useId } from 'react';
import { controlPanelStyles } from '../../theme';
import { parseUITheme, useUITheme } from '../../theme/uiTheme';
import { executeHumanFeature } from '../../commands/runtime';

export function ThemeSelect() {
  const id = useId();
  const theme = useUITheme(state => state.theme);
  return (
    <div className={controlPanelStyles.row}>
      <label htmlFor={id} className={controlPanelStyles.label}>Theme</label>
      <select id={id} className={controlPanelStyles.selectRight} value={theme}
        onChange={event => executeHumanFeature('settings.ui.theme', { value: parseUITheme(event.target.value) })}>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="system">System</option>
      </select>
    </div>
  );
}
