import plugin from 'tailwindcss/plugin';

export const components = plugin(function ({ addUtilities }) {
  addUtilities({
    '.flex-center': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    '.absolute-fill': {
      position: 'absolute',
      bottom: '0',
      left: '0',
      right: '0',
      top: '0',
    },
  });
});
