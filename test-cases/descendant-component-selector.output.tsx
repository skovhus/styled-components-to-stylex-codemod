import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <button {...stylex.props(styles.button, stylex.defaultMarker())}>
      <span {...stylex.props(styles.icon, styles.iconInButton)} />
      Click me
    </button>
  </div>
);

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
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "#BF4F74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  iconInButton: {
    width: "20px",
    height: "20px",
    opacity: {
      default: 0.8,
      [stylex.when.ancestor(":hover")]: 1,
    },
    transform: {
      default: null,
      [stylex.when.ancestor(":hover")]: "scale(1.1)",
    },
  },
});
