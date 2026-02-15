import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <div {...stylex.props(styles.card)}>Media Query Card</div>
  </div>
);

const styles = stylex.create({
  /**
   * Interpolated pseudo-class selector resolved via `pseudoMediaQuery`.
   * Uses CSS `@media (hover: hover/none)` to guard each pseudo, avoiding JS runtime.
   * All properties go into a single style object with nested pseudo + media.
   */
  card: {
    color: {
      default: "blue",
      ":hover": {
        default: null,
        "@media (hover: hover)": "red",
      },
      ":active": {
        default: null,
        "@media (hover: none)": "red",
      },
    },
    padding: "16px",
    backgroundColor: {
      default: null,
      ":hover": {
        default: null,
        "@media (hover: hover)": "yellow",
      },
      ":active": {
        default: null,
        "@media (hover: none)": "yellow",
      },
    },
  },
});
