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

  // NOTE: defaultMarker() is file-global — not scoped per component.
  // If another component in the same file also uses defaultMarker() (e.g. for
  // an ancestor relation override), its marker could incorrectly activate
  // Row's sibling styles. Use defineMarker() for strict scoping.
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
