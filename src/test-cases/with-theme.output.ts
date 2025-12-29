import React from 'react';
import * as stylex from '@stylexjs/stylex';
import { themeVars } from './tokens.stylex';

const styles = stylex.create({
  themed: {
    color: themeVars.primaryColor,
  },
});

class MyComponent extends React.Component {
  render() {
    return <div {...stylex.props(styles.themed)}>Themed Component</div>;
  }
}

export const App = () => (
  <MyComponent />
);