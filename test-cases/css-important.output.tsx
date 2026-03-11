import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";

export const App = () => (
  <div>
    <button {...mergedSx(styles.overrideButton, undefined, { background: "blue" })}>
      Should be pink despite inline style
    </button>
    <div sx={styles.forceWidth}>Full width content</div>
    <p sx={[styles.mixedStyles, styles.mixedStylesColorAndMargin]}>
      Color and margin should be overridden
    </p>
    <a href="#" sx={styles.importantHover}>
      Hover me
    </a>
    <span sx={styles.overrideText}>Override text</span>
  </div>
);

const styles = stylex.create({
  // Using !important to override inline styles or third-party CSS
  overrideButton: {
    backgroundColor: "#bf4f74 !important",
    color: "white !important",
    borderWidth: "0 !important",
    borderStyle: "none !important",
    borderColor: "initial !important",
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
      default: "#bf4f74",
      ":hover": "#4f74bf !important",
    },
    textDecoration: {
      default: "none",
      ":hover": "underline !important",
    },
  },
  // Important on interpolated theme values — both properties should keep !important
  overrideText: {
    color: `${$colors.labelMuted} !important`,
    fontSize: "10px !important",
  },
  mixedStylesColorAndMargin: {
    color: "red",
    margin: "20px",
  },
});
