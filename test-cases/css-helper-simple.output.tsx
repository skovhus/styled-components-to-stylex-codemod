import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $size: number;
};

export function Container(props: ContainerProps) {
  const { children, $size } = props;
  return <div {...stylex.props(styles.container, styles.containerStyles($size))}>{children}</div>;
}

export const App = () => <Container $size={16} />;

const styles = stylex.create({
  containerStyles: (size: number) => ({
    fontSize: `${size - 3}px`,
    lineHeight: `${size}px`,
  }),
  container: {
    display: "inline-flex",
  },
});
