import * as stylex from "@stylexjs/stylex";
import { vars, textVars } from "./css-variables.stylex";

const styles = stylex.create({
  button: {
    padding: `${vars.spacingSm} ${vars.spacingMd}`,
    backgroundColor: vars.colorPrimary,
    color: "white",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: vars.colorSecondary,
    borderRadius: vars.borderRadius,
  },
  buttonHover: {
    backgroundColor: vars.colorSecondary,
  },
  card: {
    padding: vars.spacingLg,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: vars.colorSecondary,
    borderRadius: vars.borderRadius,
    margin: vars.spacingMd,
  },
  text: {
    color: textVars.textColor,
    fontSize: textVars.fontSize,
    lineHeight: textVars.lineHeight,
  },
});

export const App = () => (
  <div {...stylex.props(styles.card)}>
    <p {...stylex.props(styles.text)}>Some text content</p>
    <button {...stylex.props(styles.button)}>Click me</button>
  </div>
);
