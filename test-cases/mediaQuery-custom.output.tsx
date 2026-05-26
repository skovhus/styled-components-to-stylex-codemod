import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ConditionalContainerProps = { size: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

export function ConditionalContainer(props: ConditionalContainerProps) {
  const { children, size, ...rest } = props;
  return (
    <div {...rest} sx={styles.conditionalContainerFontSize(size)}>
      {children}
    </div>
  );
}

export const App = () => <ConditionalContainer size={16}>Hello</ConditionalContainer>;

const styles = stylex.create({
  conditionalContainerFontSize: (size: number) => ({
    fontSize: {
      default: null,
      "@media (-webkit-min-device-pixel-ratio: 2),(min-resolution: 192dpi)": `${size - 5}px`,
    },
  }),
});
