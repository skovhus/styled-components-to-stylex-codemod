import * as stylex from "@stylexjs/stylex";
import { colorVars } from "./lib/colors.stylex";
import { helpers } from "./lib/helpers.stylex";

const styles = stylex.create({
  button: {
    padding: "0.5em 1em",
    backgroundColor: colorVars.primary,
    color: colorVars.background,
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: colorVars.secondary,
    borderRadius: "4px",
    cursor: "pointer",
  },
  buttonHover: {
    backgroundColor: colorVars.secondary,
  },
  truncatedText: {
    maxWidth: "200px",
    fontSize: "14px",
    color: colorVars.text,
  },
  centeredContainer: {
    minHeight: "100px",
    backgroundColor: colorVars.background,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colorVars.secondary,
  },
  card: {
    padding: "1em",
    backgroundColor: colorVars.background,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colorVars.secondary,
    borderRadius: "8px",
  },
  cardTitle: {
    margin: "0 0 0.5em 0",
    color: colorVars.primary,
    fontSize: "18px",
  },
});

export const App = () => (
  <div {...stylex.props(helpers.flexCenter, styles.centeredContainer)}>
    <div {...stylex.props(styles.card)}>
      <h3 {...stylex.props(helpers.truncate, styles.cardTitle)}>
        This is a very long title that should be truncated
      </h3>
      <p {...stylex.props(helpers.truncate, styles.truncatedText)}>
        This is some text content that will be truncated if it gets too long.
      </p>
      <button {...stylex.props(styles.button)}>Click me</button>
    </div>
  </div>
);
