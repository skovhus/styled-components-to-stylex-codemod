import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type ExportedButtonProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
}>;

/**
 *  This component is exported and will use shouldSupportExternalStyling to enable
 * className/style/rest merging for external style extension support.
 **/
export function ExportedButton(props: ExportedButtonProps) {
  const { className, children, style } = props;
  return <button {...mergedSx(styles.exportedButton, className, style)}>{children}</button>;
}

export const App = () => (
  <div>
    <ExportedButton>Styled Button</ExportedButton>
    <div {...stylex.props(styles.internalBox)}>Internal Box</div>
  </div>
);

const styles = stylex.create({
  exportedButton: {
    backgroundColor: "#bf4f74",
    color: "white",
    padding: "8px 16px",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },

  // This is also exported but won't use shouldSupportExternalStyling (for comparison)
  internalBox: {
    backgroundColor: "#f0f0f0",
    padding: "16px",
  },
});
