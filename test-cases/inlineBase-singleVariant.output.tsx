import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div {...stylex.props(styles.wrapper)}>
      <div {...stylex.props(styles.flex, styles.flexColumn, styles.flexGap, styles.flexCenter)}>
        Content A
      </div>
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
  },
  flexCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  flexColumn: {
    flexDirection: "column",
  },
  flexGap: {
    gap: "24px",
  },
});
