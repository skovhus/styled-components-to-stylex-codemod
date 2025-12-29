import type { DefaultTheme } from 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    colors: {
      primary: string;
      secondary: string;
      text: string;
      background: string;
    };
  }
}

export const theme: DefaultTheme = {
  colors: {
    primary: '#BF4F74',
    secondary: '#4F74BF',
    text: '#333333',
    background: '#FFFFFF',
  },
};
