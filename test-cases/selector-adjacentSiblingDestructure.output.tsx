import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.row, stylex.defaultMarker())}>First</div>
    <div {...stylex.props(styles.row, stylex.defaultMarker())}>Second</div>
  </div>
);

const styles = stylex.create({
  row: {
    marginTop: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "16px",
    },
  },
});
