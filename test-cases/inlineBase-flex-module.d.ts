declare module "@linear/orbiter/components/Flex" {
  import type * as React from "react";

  export interface FlexProps extends React.ComponentProps<"div"> {
    align?: "start" | "center" | "end" | "stretch";
    gap?: number;
    direction?: "row" | "column";
    column?: boolean;
    inlineBaseMode?: "mixin";
  }

  export const Flex: React.ComponentType<FlexProps>;
}
