import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type ContainerProps<C extends React.ElementType = "div"> = Omit<
  React.ComponentPropsWithRef<C>,
  "className" | "style" | keyof React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>
> &
  Omit<React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>, "as"> & { as?: C };

function Container<C extends React.ElementType = "div">(props: ContainerProps<C>) {
  const { as: Component = "div", children, align, column, direction, gap } = props;

  return <Component {...stylex.props(styles.container)}>{children}</Component>;
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
    display: "flex",
    flexDirection: "column",
    padding: "8px",
    backgroundColor: "#eef",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#667",
  },
});
