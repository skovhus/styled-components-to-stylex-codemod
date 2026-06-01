import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";

type ContainerProps = React.PropsWithChildren<{
  isSmall?: boolean;
}>;

export function Container(props: ContainerProps) {
  const { isSmall, ...rest } = props;
  return <div {...rest} sx={[styles.container, isSmall && styles.containerSmall]} />;
}

export const App = () => (
  <div style={{ position: "relative", minHeight: 80 }}>
    <Container>Default z-index</Container>
    <Container isSmall>Small z-index</Container>
  </div>
);

const styles = stylex.create({
  container: {
    position: "fixed",
    inset: 16,
    zIndex: `calc(${$zIndex.dialog} + 2)`,
    backgroundColor: "white",
  },
  containerSmall: {
    zIndex: $zIndex.modal,
  },
});
