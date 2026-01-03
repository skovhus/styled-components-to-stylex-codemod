import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  overrideButton: {
    backgroundColor: "#BF4F74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    padding: "8px 16px",
    borderRadius: "4px",
  },
  forceWidth: {
    width: "100%",
    maxWidth: "500px",
    margin: "0 auto",
  },
  mixedStyles: {
    fontSize: "16px",
    color: "#333",
    lineHeight: 1.5,
    margin: 0,
  },
  importantHover: {
    color: {
      default: "#BF4F74",
      ":hover": "#4F74BF",
    },
    textDecoration: {
      default: "none",
      ":hover": "underline",
    },
  },
});

export const App = () => (
  <div>
    <button {...stylex.props(styles.overrideButton)} style={{ background: "blue" }}>
      Should be pink despite inline style
    </button>
    <div {...stylex.props(styles.forceWidth)}>Full width content</div>
    <p {...stylex.props(styles.mixedStyles)} style={{ color: "red", margin: "20px" }}>
      Color and margin should be overridden
    </p>
    <a href="#" {...stylex.props(styles.importantHover)}>
      Hover me
    </a>
  </div>
);
