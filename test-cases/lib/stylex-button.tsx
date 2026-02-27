import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./mergedSx";

type StyleXButtonProps = React.PropsWithChildren<{
  variant?: "primary" | "secondary";
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  sx?: stylex.StyleXStyles;
}>;

export function StyleXButton({ children, className, style, sx, ...rest }: StyleXButtonProps) {
  return (
    <button {...rest} {...mergedSx([styles.base, sx], className, style)}>
      {children}
    </button>
  );
}

const styles = stylex.create({
  base: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
    borderRadius: "4px",
    paddingBlock: "8px",
    paddingInline: "16px",
    cursor: "pointer",
  },
});
