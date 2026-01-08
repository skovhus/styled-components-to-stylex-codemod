import * as stylex from "@stylexjs/stylex";
import { vars, textVars } from "./css-variables.stylex";
import "./css-variables.css";

export const App = () => (
  <div {...stylex.props(styles.card)}>
    <p {...stylex.props(styles.text)}>Some text content</p>
    <button {...stylex.props(styles.button)}>Click me</button>
  </div>
);

const styles = stylex.create({
  button: {
    padding: `${vars.spacingSm} ${vars.spacingMd}`,
    backgroundColor: {
      default: vars.colorPrimary,
      ":hover": vars.colorSecondary,
    },
    color: "white",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: vars.colorSecondary,
    borderRadius: vars.borderRadius,
  },
  card: {
    padding: vars.spacingLg,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: vars.colorSecondary,
    borderRadius: vars.borderRadius,
    margin: vars.spacingMd,
  },

  // Using CSS variables with fallbacks
  text: {
    color: textVars.textColor,
    fontSize: textVars.fontSize,
    lineHeight: textVars.lineHeight,
  },
});
