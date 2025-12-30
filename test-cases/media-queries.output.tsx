import * as stylex from "@stylexjs/stylex";

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
});

export const App = () => <div {...stylex.props(styles.container)}>Responsive container</div>;
