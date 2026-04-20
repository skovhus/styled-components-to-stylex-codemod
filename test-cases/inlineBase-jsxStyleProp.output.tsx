import * as stylex from "@stylexjs/stylex";

export function App({ accentColor = "#bf4f74" }: { accentColor?: string } = {}) {
  return (
    <div sx={styles.wrapper}>
      <div sx={[styles.flex, flexGapVariants[24], styles.flexDirectionalShorthand]}>
        Directional shorthand
      </div>
      <div sx={[styles.flex, flexGapVariants[8], styles.flexBackgroundAndBorder]}>
        Background and border shorthands
      </div>
      <div sx={[styles.flex, flexGapVariants[12], styles.flexMarginQuadAnd]}>
        Margin quad and explicit longhands
      </div>
      <div sx={[styles.flex, flexGapVariants[16], styles.flexDynamicColorAnd(accentColor)]}>
        Dynamic color and opacity
      </div>
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
  flexDirectionalShorthand: {
    paddingBlock: "20px",
    paddingInline: 0,
    alignItems: "flex-start",
    minWidth: 0,
    width: "100%",
  },
  flexBackgroundAndBorder: {
    backgroundColor: "#ffe0e0",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#b97",
  },
  flexMarginQuadAnd: {
    marginTop: "8px",
    marginRight: "16px",
    marginBottom: "4px",
    marginLeft: "24px",
    paddingBlock: 4,
    paddingInline: 8,
  },
  flexDynamicColorAnd: (color: string) => ({
    opacity: 0.5,
    color,
  }),
});

const flexGapVariants = stylex.create({
  8: {
    gap: "8px",
  },
  12: {
    gap: "12px",
  },
  16: {
    gap: "16px",
  },
  24: {
    gap: "24px",
  },
});
