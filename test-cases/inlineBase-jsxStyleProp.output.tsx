import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div sx={styles.wrapper}>
      <div sx={[styles.flex, flexGapVariants[24], styles.flexPromoteMe]}>Promote me</div>
      <div sx={[styles.flex, flexGapVariants[8], styles.flexAlsoPromote]}>Also promote</div>
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
  flexPromoteMe: {
    paddingBlock: "20px",
    paddingInline: "0",
    alignItems: "flex-start",
    minWidth: 0,
    width: "100%",
  },
  flexAlsoPromote: {
    minWidth: 0,
  },
});

const flexGapVariants = stylex.create({
  8: {
    gap: "8px",
  },
  24: {
    gap: "24px",
  },
});
