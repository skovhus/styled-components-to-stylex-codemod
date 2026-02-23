import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ padding: 16 }}>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>First</div>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>Second (border-bottom in CSS)</div>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>Third (border-bottom in CSS)</div>
  </div>
);

const styles = stylex.create({
  thing: {
    color: "blue",
    paddingBlock: "8px",
    paddingInline: "16px",
    borderBottomWidth: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "2px",
    },
    borderBottomStyle: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "solid",
    },
    borderBottomColor: {
      default: null,
      [stylex.when.siblingBefore(":is(*)")]: "gray",
    },
  },
});
