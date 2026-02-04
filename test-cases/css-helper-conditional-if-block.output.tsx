import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser } from "./lib/helpers";

type ContainerProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  size: number;
};

export function Container(props: ContainerProps) {
  const { children, size } = props;

  return (
    <div
      {...stylex.props(
        styles.container,
        Browser.isSafari
          ? styles.containerBrowserIsSafari({
              size,
            })
          : styles.containerDefault({
              size,
            }),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => <Container size={16}>Hello World</Container>;

const styles = stylex.create({
  containerBrowserIsSafari: (props: { size: number }) => ({
    fontSize: `${props.size - 4}px`,
    lineHeight: 1,
  }),
  containerDefault: (props: { size: number }) => ({
    fontSize: `${props.size - 3}px`,
    lineHeight: `${props.size}px`,
  }),
  container: {
    display: "inline-flex",
  },
});
