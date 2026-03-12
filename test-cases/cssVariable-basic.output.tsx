import "./cssVariable-basic.css";
import * as stylex from "@stylexjs/stylex";
import { vars } from "./css-variables.stylex";

export const App = () => (
  <div sx={styles.card}>
    <p sx={styles.text}>Some text content</p>
    <button sx={styles.button}>Click me</button>
  </div>
);

const styles = stylex.create({
  button: {
    paddingBlock: vars.spacingSm,
    paddingInline: vars.spacingMd,
    backgroundColor: {
      default: vars.colorPrimary,
      ":hover": vars.colorSecondary,
    },
    color: "white",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: vars.colorSecondary,
    borderRadius: vars.borderRadius,
  },
  card: {
    padding: vars.spacingLg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars.colorSecondary,
    borderRadius: vars.borderRadius,
    margin: vars.spacingMd,
  },
  // Using CSS variables with fallbacks
  text: {
    color: "var(--text-color, #333)",
    fontSize: "var(--font-size, 16px)",
    lineHeight: "var(--line-height, 1.5)",
  },
});
