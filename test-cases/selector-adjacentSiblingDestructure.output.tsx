import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <div {...stylex.props(styles.rowSiblingBefore, stylex.defaultMarker())}>First</div>
    <div {...stylex.props(styles.rowSiblingBefore, stylex.defaultMarker())}>Second</div>
  </div>
);

const styles = stylex.create({
  rowSiblingBefore: {
    marginTop: {
      default: null,
      [stylex.when.siblingBefore()]: "16px",
    },
  },
});
