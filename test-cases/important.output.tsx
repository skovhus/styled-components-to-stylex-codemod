import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type OverrideButtonProps = React.PropsWithChildren<{
  style?: React.CSSProperties;
}>;

// Using !important to override inline styles or third-party CSS
function OverrideButton(props: OverrideButtonProps) {
  const { children, style } = props;
  return <button {...mergedSx(styles.overrideButton, undefined, style)}>{children}</button>;
}

type MixedStylesProps = React.PropsWithChildren<{
  style?: React.CSSProperties;
}>;

// Mixed important and normal
function MixedStyles(props: MixedStylesProps) {
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
    backgroundColor: "#BF4F74 !important",
    color: "white !important",
    borderWidth: "0 !important",
    borderStyle: "none !important",
    paddingBlock: "8px",
    paddingInline: "16px",
    borderRadius: "4px",
  },

  // Overriding specific properties
  forceWidth: {
    width: "100% !important",
    maxWidth: "500px !important",
    marginBlock: "0",
    marginInline: "auto",
  },
  mixedStyles: {
    fontSize: "16px",
    color: "#333 !important",
    lineHeight: 1.5,
    marginBlock: "0",
    marginInline: "!important",
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
