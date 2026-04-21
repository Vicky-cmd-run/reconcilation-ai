/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        glass: "rgba(255, 255, 255, 0.05)",
        glassborder: "rgba(255, 255, 255, 0.1)",
      },
      animation: {
        'aurora': 'aurora-drift 20s ease-in-out infinite alternate',
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
}
