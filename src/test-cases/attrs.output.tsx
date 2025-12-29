import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  input: {
    borderRadius: "3px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#BF4F74",
    display: "block",
    margin: "0 0 1em",
    "::placeholder": {
      color: "#BF4F74",
    },
  },
  inputPadding: (padding: string) => ({
    padding,
  }),
});

export const App = () => (
  <>
    <input type="text" size={5} {...stylex.props(styles.input)} placeholder="Small" />
    <input type="text" {...stylex.props(styles.input)} placeholder="Normal" />
    <input
      type="text"
      {...stylex.props(styles.input, styles.inputPadding("2em"))}
      placeholder="Padded"
    />
  </>
);
