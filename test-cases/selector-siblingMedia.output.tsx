import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ padding: 16 }}>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>First</div>
    <div {...stylex.props(styles.thing, stylex.defaultMarker())}>
      Second (margin-top on wide screens)
    </div>
  </div>
);

const styles = stylex.create({
  thing: {
    color: "blue",
    padding: "8px",
    marginTop: {
      default: null,

      [stylex.when.siblingBefore(":is(*)")]: {
        default: null,
        "@media (min-width: 768px)": "16px",
      },
    },
  },
});
