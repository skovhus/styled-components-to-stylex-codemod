import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div {...stylex.props(styles.container)}>
    <span>Responsive container</span>
    <button {...stylex.props(styles.button)}>Hover me</button>
  </div>
);

const styles = stylex.create({
  container: {
    width: {
      default: "100%",
      "@media (min-width: 768px)": "750px",
      "@media (min-width: 1024px)": "960px",
    },
    padding: "1rem",
    backgroundColor: {
      default: "papayawhip",
      "@media (min-width: 1024px)": "mediumseagreen",
    },
    margin: {
      default: null,
      "@media (min-width: 768px)": "0 auto",
    },
  },
  button: {
    display: "block",
    marginTop: "1rem",
    paddingBlock: "12px",
    paddingInline: "24px",
    backgroundColor: "royalblue",
    borderWidth: 0,
    borderRadius: "8px",
    cursor: "pointer",
    color: "hotpink",
    transition: "transform 0.2s ease",
    transform: {
      default: null,
      ":hover": {
        default: null,
        "@media (hover: hover)": "scale(1.1)",
      },
      ":active": "scale(0.9)",
    },
  },
});
