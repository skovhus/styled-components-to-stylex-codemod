import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div {...stylex.props(styles.container)}>
    <div {...stylex.props(styles.row, rowMarker)}>First</div>
    <div {...stylex.props(styles.row, rowMarker)}>Second (should have border-top)</div>
  </div>
);
export const rowMarker = stylex.defineMarker();

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },

  // Adjacent sibling `& + &` uses defineMarker() which is scoped per-component.
  // Each component gets its own marker so sibling styles don't cross-contaminate.
  row: {
    color: "blue",
    padding: "8px",

    borderTopWidth: {
      default: null,
      [stylex.when.siblingBefore(rowMarker)]: "1px",
    },

    borderTopStyle: {
      default: null,
      [stylex.when.siblingBefore(rowMarker)]: "solid",
    },

    borderTopColor: {
      default: null,
      [stylex.when.siblingBefore(rowMarker)]: "gray",
    },
  },
});
