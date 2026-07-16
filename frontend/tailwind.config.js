/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ── Colour palette ────────────────────────────────────────────────
      colors: {
        // Backgrounds / surfaces
        bg: {
          base:     '#0A0E14',  // page background
          surface:  '#11161F',  // panel / card surface
          elevated: '#161D29',  // elevated card / tooltip
          hover:    '#1C2535',  // hover state on surfaces
        },
        // Borders
        border: {
          DEFAULT: 'rgba(255,255,255,0.10)',
          subtle:  'rgba(255,255,255,0.05)',
          strong:  'rgba(255,255,255,0.18)',
        },
        // Text
        text: {
          primary:   '#E6EDF3',
          secondary: '#8B98A9',
          muted:     '#5D6B7D',
          inverse:   '#0A0E14',
        },
        // Severity
        severity: {
          critical: '#FF4D4F',
          warning:  '#F5A623',
          info:     '#4D9FFF',
        },
        // Accent / success / correlated
        accent: {
          DEFAULT: '#2DD4A7',
          dim:     'rgba(45,212,167,0.15)',
        },
        // Confidence gradient anchors (use in inline styles for gradient)
        confidence: {
          high: '#2DD4A7',
          mid:  '#F5A623',
          low:  '#FF4D4F',
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
        card:  '8px',
        badge: '4px',
        sm: '4px',
        md: '8px',
        lg: '12px',
      },

      // ── Box shadows ──────────────────────────────────────────────────
      // Depth from surface steps, minimal shadows
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

      // ── Grid / layout ────────────────────────────────────────────────
      gridTemplateColumns: {
        'war-room': '1fr 1fr',
        'war-room-wide': '5fr 4fr',
      },
    },
  },
  plugins: [],
}
