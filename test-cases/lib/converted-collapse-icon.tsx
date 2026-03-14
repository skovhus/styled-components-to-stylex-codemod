import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Already-converted StyleX component (simulates Run 1 output).
// Includes bridge class + className/style merging so both unconverted
// styled-components consumers and converted StyleX consumers can
// override styles on this component's DOM element.
export interface CollapseArrowIconProps extends React.ComponentProps<"div"> {}

const styles = stylex.create({
  base: {
    display: "inline-block",
    width: 24,
    height: 24,
    backgroundColor: "#999",
    transition: "background-color 0.2s",
  },
});

const collapseArrowIconBridgeClass = "sc2sx-CollapseArrowIcon-a1b2c3d4";

export function CollapseArrowIcon({ className, style, ...props }: CollapseArrowIconProps) {
  const base = stylex.props(styles.base);
  return (
    <div
      {...props}
      className={[collapseArrowIconBridgeClass, base.className, className]
        .filter(Boolean)
        .join(" ")}
      style={{ ...base.style, ...style }}
    />
  );
}

/** @deprecated Bridge selector for unconverted consumers — will be removed once all files are migrated. */
export const CollapseArrowIconGlobalSelector = `.${collapseArrowIconBridgeClass}`;
