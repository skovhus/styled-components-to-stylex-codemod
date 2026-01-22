import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

interface FlexProps {
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

function Flex(props: FlexProps) {
  const { gap, className, style, children } = props;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface ContainerProps extends React.ComponentProps<typeof Flex> {
  $color?: string;
}

export function Container(props: ContainerProps) {
  const { className, children, style, $color, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...mergedSx(
        [styles.container, !!$color && styles.containerBackgroundColor($color)],
        className,
        style,
      )}
    >
      {children}
    </Flex>
  );
}

export const App = () => (
  <Container gap={4} $color="rebeccapurple">
    Hello
  </Container>
);

const styles = stylex.create({
  container: {
    paddingBlock: "2px",
    paddingInline: "6px",
    borderRadius: "3px",
  },
  containerBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
});
