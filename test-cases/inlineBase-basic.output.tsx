import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerProps = React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }> & {
  column?: any;
  gap?: any;
  align?: any;
  direction?: any;
  as?: any;
};

function Container(props: ContainerProps) {
  const { children, column, gap, align, direction, as } = props;

  return <div {...stylex.props(styles.container)}>{children}</div>;
}

export function App() {
  return <Container>content</Container>;
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "8px",
    backgroundColor: "white",
  },
});
