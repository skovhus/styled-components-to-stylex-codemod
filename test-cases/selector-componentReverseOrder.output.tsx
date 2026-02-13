import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <a href="#" {...stylex.props(styles.link, stylex.defaultMarker())}>
    <svg viewBox="0 0 20 20" {...stylex.props(styles.icon, styles.iconInLink)}>
      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
    </svg>
    Hover me
  </a>
);

const styles = stylex.create({
  link: {
    display: "flex",
    padding: "8px",
    backgroundColor: "papayawhip",
    color: "#bf4f74",
  },
  // The reverse component selector appears BEFORE the base fill declaration.
  // The base value must still be preserved as the default in the override.
  icon: {
    flex: "none",
    width: "48px",
    height: "48px",
    fill: "#bf4f74",
  },
  iconInLink: {
    fill: {
      default: "#bf4f74",
      [stylex.when.ancestor(":hover")]: "rebeccapurple",
    },
  },
});
