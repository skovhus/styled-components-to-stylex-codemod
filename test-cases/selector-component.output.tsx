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
    alignItems: "center",
    paddingBlock: "5px",
    paddingInline: "10px",
    backgroundColor: "papayawhip",
    color: "#bf4f74",
  },
  icon: {
    flex: "none",
    width: "48px",
    height: "48px",
    fill: "#bf4f74",
    transition: "fill 0.25s",
  },
  iconInLink: {
    fill: {
      default: null,
      [stylex.when.ancestor(":hover")]: "rebeccapurple",
    },
  },
});
