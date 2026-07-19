/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ── Colour palette ────────────────────────────────────────────────
      colors: {
        bg: {
          base:     'var(--bg-base)',
          raised:   'var(--bg-raised)',
          'raised-2': 'var(--bg-raised-2)',
          surface:  'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          hover:    'var(--bg-hover)',
        },
        border: {
          DEFAULT: 'var(--border)',
          subtle:  'var(--border-subtle)',
          strong:  'var(--border-strong)',
          hover:   'var(--border-hover)',
        },
        text: {
          hi:      'var(--text-hi)',
          mid:     'var(--text-mid)',
          low:     'var(--text-low)',
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
          inverse:   'var(--on-brand)',
        },
        brand: {
          DEFAULT: 'var(--brand)',
          hover:   'var(--brand-hover)',
          dim:     'var(--brand-dim)',
          on:      'var(--on-brand)',
        },
        ok: {
          DEFAULT: 'var(--ok)',
          dim:     'var(--ok-dim)',
        },
        severity: {
          critical: 'var(--severity-critical)',
          warning:  'var(--severity-warning)',
          info:     'var(--severity-info)',
        },
        sev: {
          crit:     'var(--sev-crit)',
          'crit-dim': 'var(--sev-crit-dim)',
          warn:     'var(--sev-warn)',
          'warn-dim': 'var(--sev-warn-dim)',
          info:     'var(--sev-info)',
          'info-dim': 'var(--sev-info-dim)',
        },
        viz: {
          1: 'var(--viz-1)',
          2: 'var(--viz-2)',
          3: 'var(--viz-3)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          dim:     'var(--accent-dim)',
        },
        confidence: {
          high: 'var(--conf-high)',
          mid:  'var(--conf-mid)',
          low:  'var(--conf-low)',
        },
      },

      // ── Typography ───────────────────────────────────────────────────
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'stream': ['12px', { lineHeight: '1.5', letterSpacing: '0' }],
        'ui-sm':  ['13px', { lineHeight: '1.5' }],
        'ui':     ['14px', { lineHeight: '1.5' }],
        'ui-md':  ['15px', { lineHeight: '1.5' }],
        'hero-sm': ['28px', { lineHeight: '1.2', letterSpacing: '-0.5px' }],
        'hero':    ['32px', { lineHeight: '1.2', letterSpacing: '-0.5px' }],
        'hero-lg': ['36px', { lineHeight: '1.1', letterSpacing: '-1px' }],
      },

      // ── Spacing & sizing ─────────────────────────────────────────────
      borderRadius: {
        card:  '6px',
        badge: '4px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        pill: '999px',
      },

      // ── Box shadows ──────────────────────────────────────────────────
      boxShadow: {
        card:    '0 1px 3px rgba(0,0,0,0.4)',
        elevated:'0 4px 16px rgba(0,0,0,0.5)',
        none:    'none',
      },

      // ── Animation ────────────────────────────────────────────────────
      keyframes: {
        'slide-in-right': {
          '0%':   { transform: 'translateX(24px)', opacity: '0' },
          '100%': { transform: 'translateX(0)',    opacity: '1' },
        },
        'slide-in-up': {
          '0%':   { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1',   transform: 'scale(1)' },
          '50%':       { opacity: '0.5', transform: 'scale(0.85)' },
        },
        'counter-tick': {
          '0%':   { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',     opacity: '1' },
        },
        'stream-row': {
          '0%':   { transform: 'translateY(-4px)', opacity: '0', backgroundColor: 'rgba(45,212,167,0.08)' },
          '60%':  { backgroundColor: 'rgba(45,212,167,0.04)' },
          '100%': { transform: 'translateY(0)',    opacity: '1', backgroundColor: 'transparent' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.25s ease-out forwards',
        'slide-in-up':    'slide-in-up 0.2s ease-out forwards',
        'fade-in':        'fade-in 0.2s ease-out forwards',
        'pulse-dot':      'pulse-dot 2s ease-in-out infinite',
        'stream-row':     'stream-row 0.35s ease-out forwards',
        shimmer:          'shimmer 2s linear infinite',
      },
      transitionTimingFunction: {
        'lens': 'var(--ease-lens)',
      },
      transitionDuration: {
        '120': '120ms',
        '240': '240ms',
        '400': '400ms',
      },

      // ── Grid / layout ────────────────────────────────────────────────
      gridTemplateColumns: {
        'war-room': '1fr 1fr',
        'war-room-wide': '5fr 4fr',
      },
    },
  },
  plugins: [],
}
