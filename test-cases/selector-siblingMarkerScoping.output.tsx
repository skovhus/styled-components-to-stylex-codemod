import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div {...stylex.props(styles.container)}>
    <div {...stylex.props(styles.row, stylex.defaultMarker())}>First</div>
    <div {...stylex.props(styles.row, stylex.defaultMarker())}>Second (should have border-top)</div>
  </div>
);

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  row: {
    color: "blue",
    padding: "8px",
    borderTopWidth: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "1px",
    },
    borderTopStyle: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "solid",
    },
    borderTopColor: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "gray",
    },
  },
});
