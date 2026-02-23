import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  icon: { display: "inline-block", width: 24, height: 24 },
  link: { textDecoration: "none", color: "blue" },
});

export function FirstIcon(props: React.ComponentProps<"div">) {
  return <div {...props} {...stylex.props(styles.icon)} />;
}

export function SecondLink(props: React.ComponentProps<"a">) {
  return <a {...props} {...stylex.props(styles.link)} />;
}

/** @deprecated Bridge selector for unconverted consumers */
export const FirstIconGlobalSelector = ".sc2sx-FirstIcon-aaaa1111";

/** @deprecated Bridge selector for unconverted consumers */
export const SecondLinkGlobalSelector = ".sc2sx-SecondLink-bbbb2222";
