import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  base: { display: "inline-block", width: 24, height: 24 },
});

export function CollapseArrowIcon(props: React.ComponentProps<"div">) {
  return <div {...props} {...stylex.props(styles.base)} />;
}

// This does NOT match the bridge pattern — no ".sc2sx-" prefix
export const CollapseArrowIconGlobalSelector = ".some-other-class";
