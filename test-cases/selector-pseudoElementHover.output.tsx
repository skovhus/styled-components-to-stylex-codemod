import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}>
    <label>
      Hover the thumb — it should change color:
      <input
        type="range"
        min="0"
        max="100"
        defaultValue="50"
        {...stylex.props(styles.rangeInput)}
      />
    </label>
  </div>
);

const styles = stylex.create({
  rangeInput: {
    WebkitAppearance: "none",
    width: "200px",
    height: "4px",
    backgroundColor: $colors.bgBorderSolid,
    borderRadius: "2px",
    outline: "none",
    "::-webkit-slider-thumb": {
      WebkitAppearance: "none",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      backgroundColor: {
        default: $colors.controlPrimary,
        ":hover": $colors.controlPrimaryHover,
      },
      cursor: "pointer",
      transition: "background-color 0.2s ease-in-out",
      transitionDuration: {
        default: null,
        ":hover": "0s",
      },
    },
  },
});
