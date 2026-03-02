import * as React from "react";
import type { PolymorphicComponentProps } from "./stylex-codemod";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/inline-base-flex";

type ContainerProps<C extends React.ElementType = typeof Flex> = PolymorphicComponentProps<
  React.ComponentPropsWithRef<typeof Flex>,
  C
>;

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
