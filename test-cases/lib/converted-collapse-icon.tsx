import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Already-converted StyleX component (simulates Run 1 output)
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

export function CollapseArrowIcon(props: CollapseArrowIconProps) {
  return <div {...props} {...stylex.props(styles.base)} />;
}

/** @deprecated Bridge selector for unconverted consumers — will be removed once all files are migrated. */
export const CollapseArrowIconGlobalSelector = ".sc2sx-CollapseArrowIcon-a1b2c3d4";
