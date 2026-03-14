import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser } from "./lib/helpers";

type ContainerProps = {
  size: number;
  padding: number;
} & Omit<React.ComponentProps<"div">, "className" | "style">;

export function Container(props: ContainerProps) {
  const { children, size, padding, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.container,
        styles.containerStyles({
          size,
          padding,
        }),
      ]}
    >
      {children}
    </div>
  );
}

type BranchedContainerProps = { size: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style"
>;

// css helper called from a function with if/else branches
export function BranchedContainer(props: BranchedContainerProps) {
  const { children, size, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.branchedContainer,
        Browser.isSafari
          ? styles.branchedContainerBrowserIsSafari(size)
          : styles.branchedContainerDefault(size),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Container size={16} padding={4}>
      Hello World
    </Container>
    <BranchedContainer size={16}>Branched</BranchedContainer>
  </div>
);

const styles = stylex.create({
  containerStyles: (props: { size: number; padding: number }) => ({
    fontSize: `${props.size + props.padding}px`,
    lineHeight: `${props.size}px`,
  }),
  container: {
    display: "inline-flex",
  },
  // css helper called from a function with if/else branches
  branchedContainer: {
    display: "inline-flex",
  },
  branchedContainerBrowserIsSafari: (size: number) => ({
    fontSize: `${size - 4}px`,
    lineHeight: 1,
  }),
  branchedContainerDefault: (size: number) => ({
    fontSize: `${size - 3}px`,
    lineHeight: `${size}px`,
  }),
});
