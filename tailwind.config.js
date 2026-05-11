/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#e0e9ff',
          200: '#c2d2ff',
          300: '#93aeff',
          400: '#6b8cff',
          500: '#4f6ef7',
          600: '#3a52e8',
          700: '#2f42cc',
          800: '#2b38a5',
          900: '#293482',
        },
        surface: {
          900: '#0d0f14',
          800: '#131720',
          700: '#1a2030',
          600: '#1f2535',
          500: '#252c3f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
