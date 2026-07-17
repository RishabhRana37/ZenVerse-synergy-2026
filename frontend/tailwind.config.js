/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ── Colour palette ────────────────────────────────────────────────
      colors: {
        bg: {
          base:     '#0A0A0B',  // app canvas
          surface:  'rgba(255,255,255,0.03)', // glass panel fill
          elevated: '#101012',  // elevated card / tooltip
          hover:    'rgba(255,255,255,0.06)',  // surface hover state
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          hover:   'rgba(255,255,255,0.16)',
          top:     'rgba(255,255,255,0.14)',
          subtle:  'rgba(255,255,255,0.04)',
          strong:  'rgba(255,255,255,0.12)',
        },
        text: {
          primary:   '#EDEDEF',
          secondary: '#A1A1A6',
          muted:     '#6B6B70',
          inverse:   '#05080E',
        },
        severity: {
          critical: '#FF5A5F', // --danger
          warning:  '#FFB84D', // --warning
          info:     '#3DD68C', // --success
        },
        accent: {
          DEFAULT: '#FF6363', // Raycast red
          violet:  '#7B61FF', // Violet for gradients
          dim:     'rgba(255,99,99,0.15)',
        },
        confidence: {
          high: '#3DD68C',
          mid:  '#FFB84D',
          low:  '#FF5A5F',
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
        card:  '14px',
        badge: '10px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        pill: '999px',
      },

      // ── Box shadows ──────────────────────────────────────────────────
      boxShadow: {
        card:    'inset 0 1px 0 var(--border-top), 0 8px 24px rgba(0,0,0,0.4)',
        elevated:'inset 0 1px 0 var(--border-top), 0 12px 32px rgba(0,0,0,0.6)',
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
