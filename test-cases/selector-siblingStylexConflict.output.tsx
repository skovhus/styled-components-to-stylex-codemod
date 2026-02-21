import * as stylex from "@stylexjs/stylex";

// Existing `styles` variable forces the codemod to use `stylexStyles`.
const [styles] = [{ d: "M0 0" }];

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", padding: 16 }}>
    <div {...stylex.props(stylexStyles.row, rowMarker)}>First (no border)</div>
    <div {...stylex.props(stylexStyles.row, rowMarker)}>Second (border-top)</div>
    <div {...stylex.props(stylexStyles.row, rowMarker)}>Third (border-top)</div>
    <p>{styles.d}</p>
  </div>
);
export const rowMarker = stylex.defineMarker();

const stylexStyles = stylex.create({
  row: {
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
