import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: { colors: { ink: '#20201e', muted: '#777773', paper: '#f7f6f3', lime: '#d7fa73', line: '#e7e5df' }, fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] }, boxShadow: { card: '0 14px 50px rgba(30,30,25,.06)' } } },
  plugins: [tailwindcssAnimate],
}
