import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  base: { display: "inline-block", width: 24, height: 24 },
});

function CollapseArrowIcon(props: React.ComponentProps<"div">) {
  return <div {...props} {...stylex.props(styles.base)} />;
}

export default CollapseArrowIcon;

/** @deprecated Bridge selector for unconverted consumers */
export const CollapseArrowIconGlobalSelector = ".sc2sx-CollapseArrowIcon-a1b2c3d4";
