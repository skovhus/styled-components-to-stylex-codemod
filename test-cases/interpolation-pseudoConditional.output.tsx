import * as stylex from "@stylexjs/stylex";
import { TouchDeviceToggle } from "./lib/TouchDeviceToggle";

export const App = () => (
  <TouchDeviceToggle>
    {() => (
      <button {...stylex.props(styles.button, styles.buttonActive, styles.buttonHover)}>
        Highlight Button
      </button>
    )}
  </TouchDeviceToggle>
);

const styles = stylex.create({
  /**
   * Interpolated pseudo-class selector using a runtime variable.
   * `&:${highlight}` expands to `:active` and `:hover` pseudo style objects.
   * The adapter resolves this to a `pseudoAlias` result (simple case, no
   * `styleSelectorExpr`), so all pseudo styles are applied directly.
   */
  button: {
    color: "blue",
    paddingBlock: "8px",
    paddingInline: "16px",
  },
  buttonActive: {
    color: {
      default: "blue",
      ":active": "red",
    },
    backgroundColor: {
      default: null,
      ":active": "yellow",
    },
  },
  buttonHover: {
    color: {
      default: "blue",
      ":hover": "red",
    },
    backgroundColor: {
      default: null,
      ":hover": "yellow",
    },
  },
});
