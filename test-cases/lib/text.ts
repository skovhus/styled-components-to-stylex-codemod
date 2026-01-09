import * as React from "react";

// Simulates a styled-component's Text - the `as` prop is NOT in explicit props
// In styled-components, `as` is provided by the styled() wrapper, not the component itself
export interface TextProps extends React.ComponentProps<"span"> {
  variant?: "mini" | "small" | "medium" | "large";
  color?: "base" | "muted" | "labelBase" | "labelMuted";
  // NOTE: No `as` prop here - styled-components adds it via wrapper
}

export function Text(props: TextProps) {
  const { variant, color, ...rest } = props;
  return React.createElement("span", rest);
}
