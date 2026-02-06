import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <button {...stylex.props(styles.buttonStylesRootCss, styles.buttonStylesSizeCss, styles.button)}>
    Click me
  </button>
);

const styles = stylex.create({
  button: {
    backgroundColor: "#bf4f74",
    color: "white",
    borderRadius: "4px",
  },
  buttonStylesRootCss: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    borderStyle: "none",
    cursor: "pointer",
  },
  buttonStylesSizeCss: {
    paddingBlock: "8px",
    paddingInline: "16px",
    fontSize: "14px",
  },
});
