import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { CollapseArrowIconMarker } from "./converted-collapse-icon.stylex";

// Already-converted StyleX component (simulates Run 1 output).
// Uses defineMarker() in a co-located sidecar so both unconverted
// styled-components consumers and converted StyleX consumers can
// target this component's DOM element via selectors.
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

export function CollapseArrowIcon({ className, style, ...props }: CollapseArrowIconProps) {
  const base = stylex.props(styles.base, CollapseArrowIconMarker);
  return (
    <div
      {...props}
      className={[base.className, className].filter(Boolean).join(" ")}
      style={{ ...base.style, ...style }}
    />
  );
}

/** @deprecated Bridge selector for unconverted consumers — will be removed once all files are migrated. */
export const CollapseArrowIconGlobalSelector = `.${stylex.props(CollapseArrowIconMarker).className}`;
