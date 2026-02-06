import * as React from "react";

export interface FlexProps extends React.ComponentProps<"div"> {
  align?: "start" | "center" | "end" | "stretch";
  gap?: number;
  direction?: "row" | "column";
  column?: boolean;
}

export function Flex(props: FlexProps) {
  const { align, gap, direction, ...rest } = props;
  return React.createElement("div", rest);
}
