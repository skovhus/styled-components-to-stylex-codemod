import * as stylex from "@stylexjs/stylex";

// Existing `styles` variable forces the codemod to use `stylexStyles`.
const [styles] = [{ d: "M0 0" }];

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", padding: 16 }}>
    <div {...stylex.props(stylexStyles.row, stylex.defaultMarker())}>First (no border)</div>
    <div {...stylex.props(stylexStyles.row, stylex.defaultMarker())}>Second (border-top)</div>
    <div {...stylex.props(stylexStyles.row, stylex.defaultMarker())}>Third (border-top)</div>
    <p>{styles.d}</p>
  </div>
);

const stylexStyles = stylex.create({
  row: {
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
