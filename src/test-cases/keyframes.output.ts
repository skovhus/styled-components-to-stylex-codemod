import * as stylex from '@stylexjs/stylex';

const rotate = stylex.keyframes({
  from: {
    transform: 'rotate(0deg)',
  },
  to: {
    transform: 'rotate(360deg)',
  },
});

const styles = stylex.create({
  rotate: {
    display: 'inline-block',
    animationName: rotate,
    animationDuration: '2s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
    padding: '2rem 1rem',
    fontSize: '1.2rem',
  },
});

export const App = () => <div {...stylex.props(styles.rotate)}>💅</div>;