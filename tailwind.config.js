/** Colors resolve to CSS variables defined in src/index.css so light/dark themes swap at the token level. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ground: token('ground'),
        panel: token('panel'),
        sunk: token('sunk'),
        line: token('line'),
        ink: token('ink'),
        muted: token('muted'),
        sign: token('sign'),
        'sign-ink': token('sign-ink'),
        amber: token('amber'),
        good: token('good'),
        bad: token('bad'),
        route: token('route'),
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        sans: ['"Public Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
