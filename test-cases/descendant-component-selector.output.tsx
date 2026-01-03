import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  icon: {
    display: "inline-block",
    width: "var(--sc2sx-icon-size, 16px)",
    height: "var(--sc2sx-icon-size, 16px)",
    backgroundColor: "currentColor",
    maskSize: "contain",
    opacity: "var(--sc2sx-icon-opacity, 1)",
    transform: "var(--sc2sx-icon-transform, none)",
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
    "--sc2sx-icon-opacity": {
      default: "0.8",
      ":hover": "1",
    },
    "--sc2sx-icon-transform": {
      default: "none",
      ":hover": "scale(1.1)",
    },
    "--sc2sx-icon-size": "20px",
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
