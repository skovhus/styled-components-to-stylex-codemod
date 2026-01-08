import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  // Pattern 1: styled.input.attrs (dot notation)
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
  textInput: {
    height: "32px",
    padding: "8px",
    backgroundColor: "white",
  },
});

// Pattern 2: styled("input").attrs (function call + attrs)
export interface TextInputProps {
  allowPMAutofill?: boolean;
}

export const App = () => (
  <>
    <input type="text" size={5} {...stylex.props(styles.input)} placeholder="Small" />
    <input type="text" {...stylex.props(styles.input)} placeholder="Normal" />
    <input
      type="text"
      {...stylex.props(styles.input, styles.inputPadding("2em"))}
      placeholder="Padded"
    />
    <input data-1p-ignore={true} {...stylex.props(styles.textInput)} placeholder="Text input" />
  </>
);
