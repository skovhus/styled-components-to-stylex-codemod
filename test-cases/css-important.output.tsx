import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Using !important to override inline styles or third-party CSS
function OverrideButton(
  props: React.PropsWithChildren<{
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLButtonElement>;
  }>,
) {
  const { children, style } = props;

  return <button {...mergedSx(styles.overrideButton, undefined, style)}>{children}</button>;
}

// Mixed important and normal
function MixedStyles(
  props: React.PropsWithChildren<{
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLParagraphElement>;
  }>,
) {
  const { children, style } = props;

  return <p {...mergedSx(styles.mixedStyles, undefined, style)}>{children}</p>;
}

export const App = () => (
  <div>
    <OverrideButton style={{ background: "blue" }}>
      Should be pink despite inline style
    </OverrideButton>
    <div {...stylex.props(styles.forceWidth)}>Full width content</div>
    <MixedStyles style={{ color: "red", margin: "20px" }}>
      Color and margin should be overridden
    </MixedStyles>
    <a href="#" {...stylex.props(styles.importantHover)}>
      Hover me
    </a>
  </div>
);

const styles = stylex.create({
  overrideButton: {
    backgroundColor: "#bf4f74 !important",
    backgroundImage: "none !important",
    color: "white !important",
    borderWidth: "0 !important",
    borderStyle: "none",
    borderColor: "currentcolor !important",
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
});
