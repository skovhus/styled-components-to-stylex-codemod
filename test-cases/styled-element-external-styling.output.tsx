import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// When styled("element")<Props> is used with shouldSupportExternalStyling,
// the generated wrapper type should include className and style props
// so that external code can pass them through

export type Size = "tiny" | "small" | "normal";

export type Props = {
  color?: string;
  hollow?: boolean;
  size?: Size;
};

type ColorBadgeProps = React.HTMLAttributes<HTMLSpanElement> & Props;

export function ColorBadge(props: ColorBadgeProps) {
  const { className, children, style, ...rest } = props;
  return (
    <span {...rest} {...mergedSx(styles.colorBadge, className, style)}>
      {children}
    </span>
  );
}

// Usage: ColorBadge should accept className and style from external code
export const App = () => (
  <div>
    <ColorBadge color="red" className="custom-class" style={{ opacity: 0.5 }}>
      Badge
    </ColorBadge>
  </div>
);

const styles = stylex.create({
  colorBadge: {
    display: "inline-block",
    flexShrink: 0,
    width: "12px",
    height: "12px",
    borderRadius: "50%",
  },
});
