import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div sx={styles.wrapper}>
      <div sx={styles.flexCenterColumnGap}>Content A</div>
      <div sx={styles.flex}>Content B</div>
    </div>
  );
}

const styles = stylex.create({
  wrapper: {
    padding: 16,
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
