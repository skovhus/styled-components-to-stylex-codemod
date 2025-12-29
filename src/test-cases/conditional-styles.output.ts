import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  title: {
    textAlign: 'center',
    color: '#BF4F74',
  },
  titleUpsideDown: {
    transform: 'rotate(180deg)',
  },
  box: {
    padding: '1rem',
    backgroundColor: 'papayawhip',
    opacity: 1,
    cursor: 'pointer',
  },
  boxActive: {
    backgroundColor: 'mediumseagreen',
  },
  boxDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const App = () => (
  <div>
    <h1 {...stylex.props(styles.title)}>Normal Title</h1>
    <h1 {...stylex.props(styles.title, styles.titleUpsideDown)}>Upside Down Title</h1>
    <div {...stylex.props(styles.box)}>Normal Box</div>
    <div {...stylex.props(styles.box, styles.boxActive)}>Active Box</div>
    <div {...stylex.props(styles.box, styles.boxDisabled)}>Disabled Box</div>
  </div>
);