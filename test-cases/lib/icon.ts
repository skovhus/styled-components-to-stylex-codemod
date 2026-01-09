import * as React from "react";

export interface IconProps extends React.ComponentProps<"span"> {
  width?: number;
  height?: number;
}

// Simple Icon wrapper component for testing
export function Icon(props: IconProps) {
  const { width = 16, height = 16, children, style, ...rest } = props;
  return React.createElement("span", {
    ...rest,
    style: { display: "inline-block", width, height, ...style },
    children,
  });
}
