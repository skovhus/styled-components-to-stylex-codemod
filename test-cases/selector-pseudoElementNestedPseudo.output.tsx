import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16, width: 260 }}>
    <div sx={styles.resizeHandle} />
    <div sx={styles.focusPanel}>
      <button type="button">Focus panel</button>
    </div>
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
      backgroundColor: "#cbd5e1",
    },
    ":hover::after": {
      backgroundColor: "#64748b",
    },
  },
  focusPanel: {
    position: "relative",
    padding: 16,
    borderRadius: 8,
    backgroundColor: "white",
    "::before": {
      content: '""',
      position: "absolute",
      inset: -1,
      borderRadius: 9,
      pointerEvents: "none",
      backgroundImage: "linear-gradient(to bottom, #cbd5e1, #e2e8f0)",
      transition: "background-image 120ms ease-out",
    },
    ":focus-within::before": {
      backgroundImage: "linear-gradient(to bottom, #6366f1, #a5b4fc)",
    },
  },
});
