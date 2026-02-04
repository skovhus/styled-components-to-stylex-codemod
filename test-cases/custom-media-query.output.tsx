import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ConditionalContainerProps = React.PropsWithChildren<{
  $size: number;
}>;

export function ConditionalContainer(props: ConditionalContainerProps) {
  const { children, $size, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(styles.conditionalContainerFontSizeFromProps(props))}>
      {children}
    </div>
  );
}

export const App = () => <ConditionalContainer $size={16}>Hello</ConditionalContainer>;

const styles = stylex.create({
  conditionalContainerFontSizeFromProps: (props: ConditionalContainerProps) => ({
    fontSize: {
      default: null,
      "@media (-webkit-min-device-pixel-ratio: 2),(min-resolution: 192dpi)": `${props.$size - 5}px`,
    },
  }),
});
