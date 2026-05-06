import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 16 }}>
    <div sx={styles.framedCard}>Framed card</div>
    <div sx={styles.dividerRow}>Divider row</div>
  </div>
);

const styles = stylex.create({
  framedCard: {
    position: "relative",
    padding: 16,
    backgroundColor: "white",
    borderRadius: 12,
    "::before": {
      content: '""',
      position: "absolute",
      inset: 0,
      borderRadius: "inherit",
      backgroundImage: "linear-gradient(90deg, #60a5fa, #f472b6)",
      backgroundSize: "200% 100%",
      backgroundPosition: "50% 0",
      pointerEvents: "none",
    },
  },
  dividerRow: {
    position: "relative",
    minHeight: 48,
    paddingBlock: 12,
    paddingInline: 16,
    backgroundColor: "#f8fafc",
    "::after": {
      content: '""',
      position: "absolute",
      bottom: 0,
      left: 32,
      right: 0,
      height: 0,
      borderTopWidth: 1,
      borderTopStyle: "solid",
      borderTopColor: "#cbd5e1",
      pointerEvents: "none",
    },
  },
});
