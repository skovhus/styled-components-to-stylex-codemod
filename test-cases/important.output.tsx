import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div>
    <button {...stylex.props(styles.overrideButton)}>Should have !important styles</button>
    <div {...stylex.props(styles.forceWidth)}>Full width content</div>
    <p {...stylex.props(styles.mixedStyles)}>Color and margin have !important</p>
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
    borderStyle: "none",
    paddingBlock: "8px",
    paddingInline: "16px",
    borderRadius: "4px",
  },

  // Overriding specific properties
  forceWidth: {
    width: "100% !important",
    maxWidth: "500px !important",
    marginBlock: 0,
    marginInline: "auto",
  },

  // Mixed important and normal
  mixedStyles: {
    fontSize: "16px",
    color: "#333 !important",
    lineHeight: 1.5,
    marginTop: "0 !important",
    marginRight: "0 !important",
    marginBottom: "0 !important",
    marginLeft: "0 !important",
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
