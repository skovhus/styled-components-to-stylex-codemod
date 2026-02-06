import * as React from "react";

// This simulates a component that was already converted to StyleX in its own file
// It's a regular function component, not a styled-component
export interface CollapseArrowIconProps extends React.ComponentProps<"svg"> {}

export function CollapseArrowIcon(props: CollapseArrowIconProps) {
  return (
    <svg
      style={{ display: "inline-block", width: 16, height: 16 }}
      viewBox="0 0 16 16"
      {...props}
    >
      <path d="M8 10l-4-4h8z" />
    </svg>
  );
}
