import * as React from "react";
import * as stylex from "@stylexjs/stylex";

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

type ContainerProps = { color?: string } & Omit<
  React.ComponentPropsWithRef<typeof Flex>,
  "className" | "style" | "$color"
>;

export function Container(props: ContainerProps) {
  const { color, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.container,
        props.color ? styles.containerBackgroundColor(props.color) : undefined,
      )}
    />
  );
}

export const App = () => (
  <Container gap={4} color="rebeccapurple">
    Hello
  </Container>
);

const styles = stylex.create({
  container: {
    paddingBlock: 2,
    paddingInline: 6,
    borderRadius: 3,
  },
  containerBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
});
