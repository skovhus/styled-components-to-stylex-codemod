import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type ContainerProps = React.ComponentProps<"div"> & {
  $open?: boolean;
  $delay?: number;
  children?: React.ReactNode;
};

/**
 * Test case for transitionDelay with number value.
 * The codemod should convert number 0 to "0ms" string for CSS properties.
 */
function Container(props: ContainerProps) {
  const { className, children, style, $delay, $open, ...rest } = props;

  return (
    <div
      {...rest}
      {...mergedSx(
        [
          styles.container,
          $open
            ? styles.containerOpen({
                $delay,
              })
            : undefined,
        ],
        className,
        style,
      )}
    >
      {children}
    </div>
  );
}

export function AutoFadingContainer(props: ContainerProps) {
  const { children, ...rest } = props;
  return <Container {...rest}>{children}</Container>;
}

export const App = () => (
  <AutoFadingContainer $open={true} $delay={100}>
    Content
  </AutoFadingContainer>
);

const styles = stylex.create({
  /**
   * Test case for transitionDelay with number value.
   * The codemod should convert number 0 to "0ms" string for CSS properties.
   */
  container: {
    opacity: 0,
    transition: "opacity 200ms ease-out",
    transitionDelay: "0ms",
  },
  containerOpen: (props) => ({
    opacity: 1,
    transitionDelay: `${props.$delay}ms`,
  }),
});
