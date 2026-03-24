import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <button sx={[styles.buttonStylesRootCss, styles.buttonStylesSizeCss, styles.button]}>
    Click me
  </button>
);

const styles = stylex.create({
  button: {
    backgroundColor: "#bf4f74",
    color: "white",
    borderRadius: 4,
  },
  buttonStylesRootCss: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    cursor: "pointer",
  },
  buttonStylesSizeCss: {
    paddingTop: 8,
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 16,
    fontSize: 14,
  },
});
