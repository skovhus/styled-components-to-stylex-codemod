import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <button
    sx={styles.button({
      glowColor: "rgba(0,128,255,0.3)",
    })}
  >
    Hover me
  </button>
);

const styles = stylex.create({
  button: (props: { glowColor: string }) => ({
    position: "relative",
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "#333",
    color: "white",
    "::after": {
      content: '""',
      display: "block",
      height: 3,
      opacity: {
        default: 0,
        ":hover": 1,
      },
      backgroundColor: {
        default: null,
        ":hover": props.glowColor,
      },
    },
  }),
});
