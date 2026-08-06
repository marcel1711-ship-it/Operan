import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        /* ── Surface hierarchy (dark neutral slate) ── */
        background: '#0B0F19',
        foreground: '#F8FAFC',

        card: {
          DEFAULT: '#1D2638',
          foreground: '#F8FAFC',
        },

        elevated: {
          DEFAULT: '#232E43',
          foreground: '#F8FAFC',
        },

        panel: {
          DEFAULT: '#171E2E',
          foreground: '#F8FAFC',
        },

        popover: {
          DEFAULT: '#1A2233',
          foreground: '#F8FAFC',
        },

        /* ── Brand ── */
        primary: {
          DEFAULT: '#6377FF',
          foreground: '#FFFFFF',
          hover: '#7C8CFF',
          pressed: '#5063E8',
        },

        /* ── Secondary / muted ── */
        secondary: {
          DEFAULT: 'rgba(255, 255, 255, 0.04)',
          foreground: '#E2E8F0',
        },
        muted: {
          DEFAULT: 'rgba(255, 255, 255, 0.05)',
          foreground: '#94A3B8',
        },

        /* ── Accent (brand blue) ── */
        accent: {
          DEFAULT: '#6377FF',
          foreground: '#FFFFFF',
          bg: 'rgba(99, 119, 255, 0.16)',
          border: 'rgba(99, 119, 255, 0.32)',
        },

        /* ── Status colors ── */
        destructive: {
          DEFAULT: '#FB7185',
          foreground: '#FFFFFF',
        },
        success: {
          DEFAULT: '#4ADE80',
          foreground: '#052E16',
        },
        warning: {
          DEFAULT: '#FBBF24',
          foreground: '#1A1A00',
        },
        info: {
          DEFAULT: '#38BDF8',
          foreground: '#0C2434',
        },
        automation: {
          DEFAULT: '#9B72FF',
          foreground: '#FFFFFF',
        },

        /* ── Borders ── */
        border: 'rgba(255, 255, 255, 0.10)',
        input: 'rgba(255, 255, 255, 0.12)',
        ring: '#6377FF',

        /* ── Sidebar ── */
        sidebar: {
          DEFAULT: '#111827',
          foreground: '#CBD5E1',
          active: '#7C8CFF',
          'active-bg': 'rgba(99, 119, 255, 0.16)',
          'active-border': 'rgba(99, 119, 255, 0.32)',
          hover: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.10)',
          label: '#7F8BA3',
        },

        /* ── Chart colors ── */
        chart: {
          '1': '#6377FF',
          '2': '#9B72FF',
          '3': '#4ADE80',
          '4': '#FBBF24',
          '5': '#FB7185',
        },

        /* ── Navy ramp (legacy compat) ── */
        navy: {
          950: '#0B0F19',
          900: '#111827',
          800: '#151B2B',
          700: '#171E2E',
          600: '#1D2638',
          500: '#232E43',
          400: '#2F3B52',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(99, 119, 255, 0.4)' },
          '70%': { boxShadow: '0 0 0 8px rgba(99, 119, 255, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(99, 119, 255, 0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'pulse-ring': 'pulse-ring 2s infinite',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.12), 0 1px 2px 0 rgba(0, 0, 0, 0.08)',
        'card-hover': '0 4px 14px -3px rgba(0, 0, 0, 0.2), 0 1px 3px -1px rgba(0, 0, 0, 0.1)',
        'elevated': '0 8px 24px -4px rgba(0, 0, 0, 0.25), 0 2px 6px -2px rgba(0, 0, 0, 0.12)',
        'lift': '0 4px 14px -3px rgba(0, 0, 0, 0.2), 0 1px 3px -1px rgba(0, 0, 0, 0.1)',
        'focus': '0 0 0 2px rgba(99, 119, 255, 0.45)',
        'modal': '0 12px 40px -8px rgba(0, 0, 0, 0.35), 0 4px 12px -4px rgba(0, 0, 0, 0.15)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
