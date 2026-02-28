import * as stylex from "@stylexjs/stylex";

const bounce = stylex.keyframes({
  "0%,100%": {
    transform: "translateY(0)",
  },

  "50%": {
    transform: "translateY(-4px)",
  },
});

export const App = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" style={{ color: "#bf4f74" }}>
    <path d="M4 14h16v2H4z" {...stylex.props(styles.animatedPath)} />
    <path d="M12 4l4 4H8z" {...stylex.props(styles.animatedPath)} />
  </svg>
);

const styles = stylex.create({
  animatedPath: {
    fill: "currentColor",
    transformOrigin: {
      default: null,
      ":nth-child(2)": "center",
    },
    animationName: {
      default: null,
      ":nth-child(2)": bounce,
    },
    animationDuration: {
      default: null,
      ":nth-child(2)": "1s",
    },
    animationTimingFunction: {
      default: null,
      ":nth-child(2)": "ease-in-out",
    },
    animationIterationCount: {
      default: null,
      ":nth-child(2)": "infinite",
    },
  },
});
