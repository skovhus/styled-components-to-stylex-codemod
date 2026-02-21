import * as stylex from "@stylexjs/stylex";

// Pre-existing variable collides with the generated marker name `rowMarker`.
const rowMarker = "existing-marker";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", padding: 16 }}>
    <div {...stylex.props(styles.row, rowMarker1)}>First (no border)</div>
    <div {...stylex.props(styles.row, rowMarker1)}>Second (border-top)</div>
    <p>{rowMarker}</p>
  </div>
);
export const rowMarker1 = stylex.defineMarker();

const styles = stylex.create({
  row: {
    padding: "8px",
    borderTopWidth: {
      default: null,
      [stylex.when.siblingBefore(rowMarker1)]: "1px",
    },
    borderTopStyle: {
      default: null,
      [stylex.when.siblingBefore(rowMarker1)]: "solid",
    },
    borderTopColor: {
      default: null,
      [stylex.when.siblingBefore(rowMarker1)]: "gray",
    },
  },
});
