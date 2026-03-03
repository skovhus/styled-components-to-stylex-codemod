import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div {...stylex.props(styles.wrapper)}>
      <div {...stylex.props(styles.flex, styles.flexCenterColumnGap)}>Content A</div>
      <div {...stylex.props(styles.flex)}>Content B</div>
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
    flexDirection: "row",
  },
  flexCenterColumnGap: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: "24px",
  },
});
