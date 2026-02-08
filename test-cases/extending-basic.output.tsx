import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Normal Button</button>
    <button {...stylex.props(styles.button, styles.tomatoButton)}>Tomato Button</button>
  </div>
);

const styles = stylex.create({
  button: {
    color: "#bf4f74",
    fontSize: "1em",
    margin: "1em",
    paddingBlock: "0.25em",
    paddingInline: "1em",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#bf4f74",
    borderRadius: "3px",
  },
  tomatoButton: {
    color: "tomato",
    borderColor: "tomato",
  },
});
