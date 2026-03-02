import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/inline-base-flex";

type ContainerProps<C extends React.ElementType = typeof Flex> = NoInfer<
  Omit<
    React.ComponentPropsWithRef<typeof Flex>,
    keyof Omit<React.ComponentPropsWithRef<C>, "className" | "style" | "as" | "forwardedAs">
  > &
    Omit<React.ComponentPropsWithRef<C>, "className" | "style" | "as" | "forwardedAs">
> & { as?: C };

function Container<C extends React.ElementType = typeof Flex>(props: ContainerProps<C>) {
  const { as: Component = Flex, ...rest } = props;

  return <Component {...rest} column={true} {...stylex.props(styles.container)} />;
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container>Default</Container>
      <Container as="span">As span</Container>
    </div>
  );
}

const styles = stylex.create({
  container: {
    padding: "8px",
    backgroundColor: "#eef",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#667",
  },
});
