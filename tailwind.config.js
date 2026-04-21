/** @type {import('tailwindcss').Config} */
// Colors resolve to CSS custom properties so theme switching is a single
// `data-theme` attribute flip on <html>. RGB-triplet variables keep Tailwind's
// `/<alpha-value>` modifier working (e.g. `bg-zinc-900/70`).
const zincVar = (n) => `rgb(var(--c-zinc-${n}) / <alpha-value>)`
const rgbVar = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif'
        ],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace']
      },
      colors: {
        zinc: {
          50: zincVar(50),
          100: zincVar(100),
          200: zincVar(200),
          300: zincVar(300),
          400: zincVar(400),
          500: zincVar(500),
          600: zincVar(600),
          700: zincVar(700),
          800: zincVar(800),
          900: zincVar(900),
          950: zincVar(950)
        },
        surface: {
          0: rgbVar('surface-0'),
          1: rgbVar('surface-1'),
          2: rgbVar('surface-2'),
          3: rgbVar('surface-3')
        },
        edge: rgbVar('edge'),
        accent: {
          DEFAULT: rgbVar('accent'),
          amber: rgbVar('accent-amber')
        },
        urgency: {
          high: rgbVar('urgency-high'),
          med: rgbVar('urgency-med'),
          low: rgbVar('urgency-low')
        }
      }
    }
  },
  plugins: []
}
