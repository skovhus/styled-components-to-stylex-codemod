// expected-warnings: component-selector
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  link: {
    display: "flex",
    alignItems: "center",
    padding: "5px 10px",
    backgroundColor: "papayawhip",
    color: "#BF4F74",
    "--sc2sx-icon-fill": {
      default: "#BF4F74",
      ":hover": "rebeccapurple",
    },
  },
  icon: {
    flex: "none",
    width: "48px",
    height: "48px",
    fill: "var(--sc2sx-icon-fill, #BF4F74)",
    transition: "fill 0.25s",
  },
});

export const App = () => (
  <a href="#" {...stylex.props(styles.link)}>
    <svg viewBox="0 0 20 20" {...stylex.props(styles.icon)}>
      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
    </svg>
    Hover me
  </a>
);
