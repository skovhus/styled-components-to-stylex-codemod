import * as React from "react";

export interface TextProps extends React.ComponentProps<"span"> {
  variant?: "mini" | "small" | "medium" | "large";
  color?: "base" | "muted" | "labelBase" | "labelMuted";
  /** Polymorphic `as` prop to render as different element - similar to styled-components */
  as?: React.ElementType;
}

export function Text(props: TextProps) {
  const { variant, color, as: Component = "span", ...rest } = props;
  return React.createElement(Component, rest);
}
