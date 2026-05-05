import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ padding: 16, width: 220 }}>
    <div sx={styles.resizeHandle} />
  </div>
);

const styles = stylex.create({
  resizeHandle: {
    position: "relative",
    height: 24,
    cursor: "ns-resize",
    "::after": {
      content: '""',
      position: "absolute",
      left: 8,
      right: 8,
      top: 10,
      height: 4,
      borderRadius: 999,
      backgroundColor: {
        default: "#cbd5e1",
        ":hover": "#64748b",
      },
    },
  },
});
