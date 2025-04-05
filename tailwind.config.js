/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#8A2BE2', // Purple
          50: '#F5EFFE',
          100: '#E2CCFD',
          200: '#C99AFC',
          300: '#B168FB',
          400: '#9836F9',
          500: '#8A2BE2',
          600: '#7923BE',
          700: '#681B9A',
          800: '#571377',
          900: '#460B53',
        },
        secondary: {
          DEFAULT: '#6C0BA9',
          50: '#F2E6FD',
          100: '#D9ACFC',
          200: '#C073FA',
          300: '#A83AF9',
          400: '#8F02F8',
          500: '#6C0BA9',
          600: '#5A0990',
          700: '#490776',
          800: '#37055D',
          900: '#260344',
        },
        background: {
          DEFAULT: '#0F0818',
          50: '#1D1029',
          100: '#2B183A',
          200: '#39204B',
          300: '#47285C',
          400: '#55306D',
        },
        accent: {
          DEFAULT: '#00E8FC',
          dark: '#00B4C5',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'grid-pattern': 'linear-gradient(to right, #1D1029 1px, transparent 1px), linear-gradient(to bottom, #1D1029 1px, transparent 1px)',
      },
      gridTemplateColumns: {
        'auto-fill-200': 'repeat(auto-fill, minmax(200px, 1fr))',
        'auto-fill-300': 'repeat(auto-fill, minmax(300px, 1fr))',
      },
    },
  },
  plugins: [],
}
