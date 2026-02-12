import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <input placeholder="Focus me..." {...stylex.props(styles.input)} />
    <input disabled placeholder="Disabled" {...stylex.props(styles.input)} />
    <input type="checkbox" {...stylex.props(styles.checkbox)} />
    <input type="checkbox" disabled {...stylex.props(styles.checkbox)} />
  </div>
);

const styles = stylex.create({
  // Chained pseudo-selectors with :not()
  input: {
    paddingBlock: "8px",
    paddingInline: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: {
      default: "#ccc",
      ":focus:not(:disabled)": "#bf4f74",
      ":hover:not(:disabled):not(:focus)": "#999",
    },
    borderRadius: "4px",
    backgroundColor: {
      default: "white",
      ":disabled": "#f5f5f5",
    },
    backgroundImage: {
      default: "none",
      ":disabled": "none",
    },
    outline: {
      default: null,
      ":focus:not(:disabled)": "none",
    },
    cursor: {
      default: null,
      ":disabled": "not-allowed",
    },
  },
  // Checkbox with chained pseudos
  checkbox: {
    width: "20px",
    height: "20px",
    cursor: "pointer",
    accentColor: {
      default: null,
      ":checked:not(:disabled)": "#bf4f74",
    },
    outline: {
      default: null,
      ":focus:not(:disabled)": "2px solid #4f74bf",
    },
    outlineOffset: {
      default: null,
      ":focus:not(:disabled)": "2px",
    },
  },
});
