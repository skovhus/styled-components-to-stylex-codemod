import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export type InnerSxControlProps = Omit<React.ComponentProps<"input">, "type"> & {
  sx?: stylex.StyleXStyles;
};

export function InnerSxControl(props: InnerSxControlProps) {
  const { sx, className, style, ...rest } = props;
  const sxProps = stylex.props(sx);

  return (
    <label className={className} style={style}>
      <input
        {...rest}
        {...sxProps}
        type="checkbox"
        style={{ ...sxProps.style, opacity: 0, position: "absolute" }}
      />
      <span>Control</span>
    </label>
  );
}
