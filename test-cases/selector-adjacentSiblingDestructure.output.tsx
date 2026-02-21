import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.row, rowMarker)}>First</div>
    <div {...stylex.props(styles.row, rowMarker)}>Second</div>
  </div>
);
export const rowMarker = stylex.defineMarker();

const styles = stylex.create({
  row: {
    marginTop: {
      default: null,
      [stylex.when.siblingBefore(rowMarker)]: "16px",
    },
  },
});
