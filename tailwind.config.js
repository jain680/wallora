/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        serif: ['var(--font-playfair)', 'serif'],
      },
      colors: {
        warm: {
          50: '#faf8f5',
          100: '#f5f1e8',
          200: '#e8ddd0',
          300: '#d4c2a8',
          400: '#b89d7a',
          500: '#9d7a5c',
          600: '#8a6b4f',
          700: '#725843',
          800: '#5f4a3a',
          900: '#4f3f32',
        },
        stone: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
        sage: {
          light: '#E7EBE4',
          DEFAULT: '#94A38C',
          dark: '#5F6F58',
        },
        clay: {
          light: '#F5EBE9',
          DEFAULT: '#C17C74',
          dark: '#8A534D',
        }
      },
    },
  },
  plugins: [],
}
