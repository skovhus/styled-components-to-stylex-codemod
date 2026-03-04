import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div {...stylex.props(styles.wrapper)}>
      <div {...stylex.props(styles.flexCenterColumnGap)}>Content A</div>
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
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "24px",
  },
});
