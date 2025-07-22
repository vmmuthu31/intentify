/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,ts,tsx}',
    './components/**/*.{js,ts,tsx}',
    './screens/**/*.{js,ts,tsx}',
    './constants/**/*.{js,ts,tsx}',
  ],

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Intentify brand colors
        primary: {
          DEFAULT: '#FF4500',
          50: '#FFF2E5',
          100: '#FFE0CC',
          200: '#FFC299',
          300: '#FFA366',
          400: '#FF8533',
          500: '#FF4500',
          600: '#E63E00',
          700: '#CC3700',
          800: '#B33000',
          900: '#992900',
        },
        dark: {
          bg: '#0A0A0A',
          card: '#1A1A1A',
          border: '#2A2A2A',
          text: '#FFFFFF',
          gray: '#8E8E93',
        },
        success: '#00D4AA',
        warning: '#FFB800',
        danger: '#FF4757',
      },
    },
  },
  plugins: [],
};
