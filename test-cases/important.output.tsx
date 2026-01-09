import * as stylex from "@stylexjs/stylex";

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

const styles = stylex.create({
  // Using !important to override inline styles or third-party CSS
  overrideButton: {
    backgroundColor: "#BF4F74 !important",
    color: "white !important",
    borderWidth: "0 !important",
    borderStyle: "none !important",
    padding: "8px 16px",
    borderRadius: "4px",
  },

  // Overriding specific properties
  forceWidth: {
    width: "100% !important",
    maxWidth: "500px !important",
    margin: "0 auto",
  },

  // Mixed important and normal
  mixedStyles: {
    fontSize: "16px",
    color: "#333 !important",
    lineHeight: 1.5,
    margin: "0 !important",
  },

  // Important in pseudo-selectors
  importantHover: {
    color: {
      default: "#BF4F74",
      ":hover": "#4F74BF !important",
    },
    textDecoration: {
      default: "none",
      ":hover": "underline !important",
    },
  },
});
