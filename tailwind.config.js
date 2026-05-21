/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.tsx',
    './components/**/*.tsx',
  ],
  theme: {
    extend: {
      colors: {
        bm: {
          50:  '#F5F5F5',
          100: '#E5E4F0',
          200: '#B9B7C9',
          600: '#410074',
          700: '#25024C',
          800: '#0F0326',
          900: '#090812',
        },
      },
    },
  },
  plugins: [],
};
