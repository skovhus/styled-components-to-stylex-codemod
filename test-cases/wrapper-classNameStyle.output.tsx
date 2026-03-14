import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// When a styled component is used as a base that accepts className and style,
// the wrapper should preserve these props for external styling support

export type Size = "tiny" | "small" | "normal";

export type Props = {
  color?: string;
  hollow?: boolean;
  size?: Size;
};

type BadgeProps = Props & {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

export function ColorBadge(props: BadgeProps) {
  // className and style should be available from the styled component
  const { className, children, style } = props;

  return <span {...mergedSx(styles.badge, className, style)}>{children}</span>;
}

export const App = () => (
  <ColorBadge color="red" className="custom-class" style={{ opacity: 0.5 }}>
    Badge
  </ColorBadge>
);

const styles = stylex.create({
  badge: {
    display: "inline-block",
    flexShrink: 0,
    width: 12,
    height: 12,
    borderRadius: "50%",
  },
});
