import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  button: {
    display: "inline-block",
    padding: "8px 16px",
    backgroundColor: "#BF4F74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
    textDecoration: "none",
    cursor: "pointer",
  },
  buttonWrapper: {
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
  },
});

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Regular Button</button>
    <a href="#" {...stylex.props(styles.button)}>
      Button as Link
    </a>
    <a href="#" {...stylex.props(styles.button, styles.buttonWrapper)}>
      Wrapper forwards as Link
    </a>
  </div>
);
