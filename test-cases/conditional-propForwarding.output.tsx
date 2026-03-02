import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/flex";

type TooltipContainerProps = Omit<
  React.ComponentPropsWithRef<typeof Flex>,
  "className" | "style"
> & { position: "top" | "bottom" };

function TooltipContainer(props: TooltipContainerProps) {
  const { children, position, ...rest } = props;

  return (
    <Flex
      position={position}
      {...rest}
      {...stylex.props(
        styles.tooltipContainer,
        position === "top" && styles.tooltipContainerPositionTop,
        position !== "top" && styles.tooltipContainerPositionNotTop,
      )}
    >
      {children}
    </Flex>
  );
}

export const App = () => (
  <div>
    <TooltipContainer position="top">Above</TooltipContainer>
    <TooltipContainer position="bottom">Below</TooltipContainer>
  </div>
);

const styles = stylex.create({
  tooltipContainer: {
    padding: "8px",
  },
  tooltipContainerPositionNotTop: {
    borderTopWidth: "2px",
    borderTopStyle: "solid",
    borderTopColor: "black",
  },
  tooltipContainerPositionTop: {
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
    borderBottomColor: "black",
  },
});
