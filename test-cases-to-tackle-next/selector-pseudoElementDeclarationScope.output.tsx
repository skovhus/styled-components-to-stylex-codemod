import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ padding: 16 }}>
    <div sx={styles.framedCard}>Framed card</div>
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
});
