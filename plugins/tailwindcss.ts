import plugin from 'tailwindcss/plugin';

export const components = plugin(function ({ addUtilities }) {
  addUtilities({
    '.flex-center': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
});
