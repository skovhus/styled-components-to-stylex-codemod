import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}>
    <input type="range" min="0" max="100" defaultValue="50" {...stylex.props(styles.rangeInput)} />
  </div>
);

const styles = stylex.create({
  rangeInput: {
    WebkitAppearance: "none",
    width: "200px",
    height: "4px",
    backgroundColor: "#ccc",
    borderRadius: "2px",
    outline: "none",
    "::-webkit-slider-thumb": {
      WebkitAppearance: "none",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      backgroundColor: {
        default: "#bf4f74",
        ":hover": "#ff6b9d",
      },
      cursor: "pointer",
      transitionProperty: "background-color",
      transitionDuration: {
        default: "0.2s",
        ":hover": "0s",
      },
      transitionTimingFunction: "ease-in-out",
    },
  },
});
