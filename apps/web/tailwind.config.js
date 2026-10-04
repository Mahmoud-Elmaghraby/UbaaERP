/** @type {import('tailwindcss').Config} */

// كل الألوان تُقرأ من متغيرات CSS في src/index.css (نظام التصميم)، فتغيير لون
// الهوية وقت التشغيل (ThemeProvider) ينعكس على كل الأصناف تلقائيًا.
const hsl = (name) => `hsl(var(--${name}))`;

module.exports = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../libs/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: hsl('border'),
        input: hsl('input'),
        ring: hsl('ring'),
        background: hsl('background'),
        foreground: hsl('foreground'),
        subtle: hsl('subtle'),
        primary: {
          DEFAULT: hsl('primary'),
          foreground: hsl('primary-foreground'),
        },
        brand: {
          50: hsl('brand-50'),
          100: hsl('brand-100'),
          200: hsl('brand-200'),
          300: hsl('brand-300'),
          400: hsl('brand-400'),
          500: hsl('brand-500'),
          600: hsl('brand-600'),
          700: hsl('brand-700'),
          800: hsl('brand-800'),
          900: hsl('brand-900'),
        },
        secondary: {
          DEFAULT: hsl('secondary'),
          foreground: hsl('secondary-foreground'),
        },
        destructive: {
          DEFAULT: hsl('destructive'),
          foreground: hsl('destructive-foreground'),
        },
        success: { DEFAULT: hsl('success'), soft: hsl('success-soft') },
        warning: { DEFAULT: hsl('warning'), soft: hsl('warning-soft') },
        info: { DEFAULT: hsl('info'), soft: hsl('info-soft') },
        danger: { DEFAULT: hsl('danger'), soft: hsl('danger-soft') },
        muted: {
          DEFAULT: hsl('muted'),
          foreground: hsl('muted-foreground'),
        },
        accent: {
          DEFAULT: hsl('accent'),
          foreground: hsl('accent-foreground'),
        },
        popover: {
          DEFAULT: hsl('popover'),
          foreground: hsl('popover-foreground'),
        },
        card: {
          DEFAULT: hsl('card'),
          foreground: hsl('card-foreground'),
        },
        sidebar: {
          DEFAULT: hsl('sidebar-background'),
          foreground: hsl('sidebar-foreground'),
          mutedForeground: hsl('sidebar-muted-foreground'),
          accent: hsl('sidebar-accent'),
          accentForeground: hsl('sidebar-accent-foreground'),
          border: hsl('sidebar-border'),
        },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        // خط واحد للنظام كله (قرار 2026-10-04): IBM Plex Sans Arabic.
        sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
        display: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
        overlay: '0 12px 32px -4px rgb(16 24 40 / 0.14), 0 4px 8px -2px rgb(16 24 40 / 0.06)',
      },
      height: {
        row: 'var(--row-h)',
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
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
