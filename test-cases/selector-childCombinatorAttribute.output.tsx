import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <div sx={styles.trigger}>
      <button sx={[styles.actionButton, styles.childActionButton]}>Enabled</button>
      <button disabled sx={[styles.actionButton, styles.childActionButton]}>
        Disabled
      </button>
    </div>
  </div>
);

const styles = stylex.create({
  actionButton: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "#bf4f74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: 4,
  },
  trigger: {
    display: "flex",
    gap: 8,
    padding: 16,
    backgroundColor: "#f0f0f0",
  },
  childActionButton: {
    pointerEvents: {
      default: null,
      ":disabled": "none",
    },
    opacity: {
      default: null,
      ":disabled": 0.5,
    },
  },
});
