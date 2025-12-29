import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  button: {
    backgroundColor: "white",
    color: "#BF4F74",
    fontSize: "1em",
    margin: "1em",
    padding: "0.25em 1em",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#BF4F74",
    borderRadius: "3px",
  },
  buttonPrimary: {
    backgroundColor: "#BF4F74",
    color: "white",
  },
});

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Normal</button>
    <button {...stylex.props(styles.button, styles.buttonPrimary)}>Primary</button>
  </div>
);
