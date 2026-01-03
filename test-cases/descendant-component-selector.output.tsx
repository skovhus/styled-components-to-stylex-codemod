import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  icon: {
    display: "inline-block",
    width: "16px",
    height: "16px",
    backgroundColor: "currentColor",
    maskSize: "contain",
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    backgroundColor: "#BF4F74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
    width: "20px",
    height: "20px",
    opacity: 1,
    transform: "scale(1.1)",
  },
});

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>
      <span {...stylex.props(styles.icon)} />
      Click me
    </button>
  </div>
);
