import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Flex } from "./lib/inline-base-flex";

type ContainerProps<C extends React.ElementType = typeof Flex> = React.ComponentPropsWithRef<
  typeof Flex
> &
  Omit<
    React.ComponentPropsWithRef<C>,
    keyof React.ComponentPropsWithRef<typeof Flex> | "className" | "style"
  > & {
    as?: C;
  };

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
