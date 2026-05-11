import * as React from "react";

export interface IconProps extends React.ComponentProps<"span"> {
  width?: number;
  height?: number;
  size?: number;
}

// Simple Icon wrapper component for testing
export function Icon(props: IconProps) {
  const { size = 16, width = size, height = size, children, style, ...rest } = props;
  return React.createElement("span", {
    ...rest,
    style: { display: "inline-block", width, height, ...style },
    children,
  });
}
