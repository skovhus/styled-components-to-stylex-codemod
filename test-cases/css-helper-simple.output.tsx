import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  size: number;
  padding: number;
};

export function Container(props: ContainerProps) {
  const { children, size, padding } = props;
  return (
    <div {...stylex.props(styles.container, styles.containerStyles(size, padding))}>{children}</div>
  );
}

export const App = () => <Container size={16} padding={4} />;

const styles = stylex.create({
  containerStyles: (size: number, padding: number) => ({
    fontSize: `${size + padding}px`,
    lineHeight: `${size}px`,
  }),
  container: {
    display: "inline-flex",
  },
});
