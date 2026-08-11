export const Platform = {
  OS: 'ios',
  select: <T>(values: { ios?: T; default?: T }): T | undefined =>
    values.ios ?? values.default,
};
