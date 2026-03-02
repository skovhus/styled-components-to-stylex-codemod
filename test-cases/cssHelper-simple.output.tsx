import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerProps = {
  size: number;
  padding: number;
} & Omit<React.ComponentProps<"div">, "className" | "style">;

export function Container(props: ContainerProps) {
  const { children, size, padding, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(
        styles.container,
        styles.containerStyles({
          size,
          padding,
        }),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <Container size={16} padding={4}>
    Hello World
  </Container>
);

const styles = stylex.create({
  containerStyles: (props: { size: number; padding: number }) => ({
    fontSize: `${props.size + props.padding}px`,
    lineHeight: `${props.size}px`,
  }),
  container: {
    display: "inline-flex",
  },
});
