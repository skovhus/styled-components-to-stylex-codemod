import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  util: { display: "flex" },
  icon: { display: "inline-block", width: 24, height: 24 },
});

/** Unrelated default export */
function Util(props: React.ComponentProps<"div">) {
  return <div {...props} {...stylex.props(styles.util)} />;
}

export default Util;

/** Named component that has a bridge selector */
export function CollapseArrowIcon(props: React.ComponentProps<"div">) {
  return <div {...props} {...stylex.props(styles.icon)} />;
}

/** @deprecated Bridge selector for unconverted consumers */
export const CollapseArrowIconGlobalSelector = ".sc2sx-CollapseArrowIcon-a1b2c3d4";
