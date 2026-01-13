/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Background layers
        'bg-void': 'var(--bg-void)',
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'bg-hover': 'var(--bg-hover)',
        'bg-input': 'var(--bg-input)',
        'bg-elevated': 'var(--bg-elevated)',
        // Text
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        // Borders
        'border-color': 'var(--border-color)',
        'border-light': 'var(--border-light)',
        'border-subtle': 'var(--border-subtle)',
        // Accent
        'accent': 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-dim': 'var(--accent-dim)',
        // Semantic
        'success': 'var(--success)',
        'warning': 'var(--warning)',
        'error': 'var(--error)',
        'info': 'var(--info)',
        // 3D Visualization (preserved)
        'frustum-default': 'var(--frustum-default)',
        'frustum-selected': 'var(--frustum-selected)',
        'point-triangulated': 'var(--point-triangulated)',
        'point-untriangulated': 'var(--point-untriangulated)',
        'match-line': 'var(--match-line)',
      },
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1.4' }],     // 12px
        'sm': ['0.875rem', { lineHeight: '1.4' }],    // 14px
        'base': ['1rem', { lineHeight: '1.5' }],      // 16px
        'lg': ['1.125rem', { lineHeight: '1.5' }],    // 18px
        'xl': ['1.25rem', { lineHeight: '1.5' }],     // 20px
      },
      spacing: {
        'xs': '2px',
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '24px',
        '3xl': '32px',
      },
      borderRadius: {
        'xs': '2px',
        'sm': '3px',
        'md': '4px',
        'lg': '6px',
        'xl': '8px',
      },
      boxShadow: {
        'xs': '0 1px 2px rgba(0, 0, 0, 0.4)',
        'sm': '0 2px 4px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
        'md': '0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)',
        'lg': '0 8px 24px rgba(0, 0, 0, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4)',
      },
      transitionDuration: {
        'fast': '100ms',
        'base': '150ms',
        'slow': '250ms',
        'smooth': '300ms',
      },
      zIndex: {
        'dropdown': '100',
        'sticky': '200',
        'overlay': '500',
        'modal': '1000',
        'toast': '1500',
        'tooltip': '2000',
      },
    },
  },
  plugins: [],
};
