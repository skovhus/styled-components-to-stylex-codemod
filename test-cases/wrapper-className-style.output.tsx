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

type StyledBadgeProps = Props & {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

function StyledBadge(props: StyledBadgeProps) {
  const { className, children, style, ...rest } = props;
  return (
    <span {...rest} {...mergedSx(styles.styledBadge, className, style)}>
      {children}
    </span>
  );
}

type BadgeProps = Props & {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

export function ColorBadge(props: BadgeProps) {
  // className and style should be available from the styled component
  const { className, children, style } = props;
  return (
    <StyledBadge className={className} style={style}>
      {children}
    </StyledBadge>
  );
}

export const App = () => (
  <ColorBadge color="red" className="custom-class" style={{ opacity: 0.5 }}>
    Badge
  </ColorBadge>
);

const styles = stylex.create({
  styledBadge: {
    display: "inline-block",
    flexShrink: 0,
    width: "12px",
    height: "12px",
    borderRadius: "50%",
  },
});
