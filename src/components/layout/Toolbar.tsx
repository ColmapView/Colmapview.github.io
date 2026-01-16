import { toolbarStyles } from '../../theme';

export function Toolbar() {
  return (
    <header className={toolbarStyles.container}>
      <h1 className="text-ds-primary font-semibold text-lg">COLMAP WebView</h1>
    </header>
  );
}
