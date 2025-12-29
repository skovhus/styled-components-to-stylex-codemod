import * as stylex from '@stylexjs/stylex';

// CSS variables become StyleX defineVars
export const vars = stylex.defineVars({
  colorPrimary: '#BF4F74',
  colorSecondary: '#4F74BF',
  spacingSm: '8px',
  spacingMd: '16px',
  spacingLg: '24px',
  borderRadius: '4px',
});

// Variables with fallbacks that may not be defined
export const textVars = stylex.defineVars({
  textColor: '#333',
  fontSize: '16px',
  lineHeight: '1.5',
});
