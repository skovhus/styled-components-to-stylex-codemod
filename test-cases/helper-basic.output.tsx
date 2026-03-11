import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div sx={[helpers.flexCenter, styles.centeredContainer]}>
    <div sx={styles.card}>
      <h3 sx={[helpers.truncate, styles.cardTitle]}>
        This is a very long title that should be truncated
      </h3>
      <p sx={[helpers.truncate, styles.truncatedText]}>
        This is some text content that will be truncated if it gets too long.
      </p>
      <button sx={styles.button}>Click me</button>
    </div>
  </div>
);

const styles = stylex.create({
  // Using theme accessor helper
  button: {
    paddingBlock: "0.5em",
    paddingInline: "1em",
    backgroundColor: {
      default: $colors.primaryColor,
      ":hover": $colors.bgSub,
    },
    color: $colors.textPrimary,
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: $colors.bgSub,
    borderRadius: "4px",
    cursor: "pointer",
  },
  // Using CSS snippet helper for truncation
  truncatedText: {
    maxWidth: "200px",
    fontSize: "14px",
    color: $colors.textSecondary,
  },
  // Using CSS snippet helper for flex centering
  centeredContainer: {
    minHeight: "100px",
    backgroundColor: $colors.bgBase,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.bgSub,
  },
  // Combining multiple helpers
  card: {
    padding: "1em",
    backgroundColor: $colors.bgBase,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.bgSub,
    borderRadius: "8px",
  },
  cardTitle: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: "0.5em",
    marginLeft: 0,
    color: $colors.primaryColor,
    fontSize: "18px",
  },
});
