import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

/**
 *  This component is exported and will use shouldSupportExternalStyling to enable
 * className/style/rest merging for external style extension support.
 **/
export function ExportedButton<C extends React.ElementType = "button">(
  props: React.ComponentPropsWithRef<C> & {
    sx?: stylex.StyleXStyles;
    as?: C;
  },
) {
  const { as: Component = "button", className, children, style, sx, ...rest } = props;

  return (
    <Component {...rest} {...mergedSx([styles.exportedButton, sx], className, style)}>
      {children}
    </Component>
  );
}

export const App = () => (
  <div>
    <ExportedButton>Styled Button</ExportedButton>
    <div sx={styles.internalBox}>Internal Box</div>
  </div>
);

const styles = stylex.create({
  exportedButton: {
    backgroundColor: "#bf4f74",
    color: "white",
    paddingBlock: "8px",
    paddingInline: "16px",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: "4px",
  },

  // This is also exported but won't use shouldSupportExternalStyling (for comparison)
  internalBox: {
    backgroundColor: "#f0f0f0",
    padding: "16px",
  },
});
