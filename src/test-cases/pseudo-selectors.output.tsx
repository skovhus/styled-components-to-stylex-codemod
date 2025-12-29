import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  thing: {
    color: {
      default: 'blue',
      ':hover': 'red',
    },
    outline: {
      default: null,
      ':focus': '2px solid blue',
    },
    '::before': {
      content: '"🔥"',
    },
  },
});

export const App = () => <div {...stylex.props(styles.thing)}>Hover me!</div>;