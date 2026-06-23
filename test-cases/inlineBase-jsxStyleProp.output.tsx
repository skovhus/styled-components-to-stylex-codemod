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
      <div sx={[styles.flex, flexGapVariants[12], styles.flexMarginQuad]}>
        Margin quad and explicit longhands
      </div>
      <div sx={[styles.flex, flexGapVariants[16]]} style={{ color: accentColor, opacity: 0.5 }}>
        Dynamic color and opacity
      </div>
      <div sx={[styles.flex, flexGapVariants[20], styles.flexInline]}>
        Vendor-prefixed longhand still promotes
      </div>
      <div sx={[styles.flex, flexGapVariants[28], styles.flexInline2]}>
        Single-function background still promotes
      </div>
    </div>
  );
}

const styles = stylex.create({
  wrapper: {
    padding: 16,
    backgroundColor: "#f0f5ff",
    borderBottomWidth: 0,
    borderBottomStyle: "none",
    borderBottomColor: "initial",
    // min height keeps schedule variants from resizing the modal
    minHeight: 200,
  },
  flex: {
    display: "flex",
    flexDirection: "row",
  },
  flexDirectionalShorthand: {
    paddingBlock: 20,
    paddingInline: 0,
    alignItems: "flex-start",
    // min width keeps flex children from expanding the container
    minWidth: 0,
    width: "100%",
  },
  flexBackgroundAndBorder: {
    backgroundColor: "#ffe0e0",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#b97",
  },
  flexMarginQuad: {
    marginTop: 8,
    marginRight: 16,
    marginBottom: 4,
    marginLeft: 24,
    paddingBlock: 4,
    paddingInline: 8,
  },
  flexInline: {
    WebkitMaskImage: "none",
    color: "white",
  },
  flexInline2: {
    backgroundImage: "linear-gradient(to right, #f00, #00f)",
  },
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
  20: {
    gap: "20px",
  },
  24: {
    gap: "24px",
  },
  28: {
    gap: "28px",
  },
});
