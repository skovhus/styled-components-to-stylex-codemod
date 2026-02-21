import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <div {...stylex.props(styles.trigger, stylex.defaultMarker())}>
      <button {...stylex.props(styles.actionButton, styles.actionButtonInTrigger)}>Enabled</button>
      <button disabled {...stylex.props(styles.actionButton, styles.actionButtonInTrigger)}>
        Disabled
      </button>
    </div>
  </div>
);

const styles = stylex.create({
  actionButton: {
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "#bf4f74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  trigger: {
    display: "flex",
    gap: "8px",
    padding: "16px",
    backgroundColor: "#f0f0f0",
  },
  actionButtonInTrigger: {
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
