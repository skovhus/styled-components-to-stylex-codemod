import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Normal Button</button>
    <button {...stylex.props(styles.button, styles.tomatoButton)}>Tomato Button</button>
  </div>
);

const styles = stylex.create({
  button: {
    color: "#BF4F74",
    fontSize: "1em",
    margin: "1em",
    padding: "0.25em 1em",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#BF4F74",
    borderRadius: "3px",
  },
  tomatoButton: {
    color: "tomato",
    borderColor: "tomato",
  },
});
