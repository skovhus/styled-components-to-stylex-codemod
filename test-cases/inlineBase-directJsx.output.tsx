import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div {...stylex.props(styles.wrapper)}>
      <div {...stylex.props(styles.flex, flexGapVariants[8], flexAlignVariants["center"])}>
        Hello
      </div>
      <div {...stylex.props(styles.flex, flexGapVariants[16], flexAlignVariants["start"])}>
        World
      </div>
    </div>
  );
}

const styles = stylex.create({
  wrapper: {
    padding: "16px",
    backgroundColor: "#f0f5ff",
  },
  flex: {
    display: "flex",
    flexDirection: "column",
  },
});

const flexAlignVariants = stylex.create({
  center: {
    alignItems: "center",
  },
  start: {
    alignItems: "flex-start",
  },
});

const flexGapVariants = stylex.create({
  8: {
    gap: "8px",
  },
  16: {
    gap: "16px",
  },
});
