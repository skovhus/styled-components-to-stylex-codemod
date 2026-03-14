import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type ContainerProps = {
  column?: boolean;
  overflowHidden?: boolean;
} & { sx?: stylex.StyleXStyles } & Pick<
    React.ComponentProps<"div">,
    "className" | "style" | "ref" | "children"
  >;

export function Container(props: ContainerProps) {
  const { className, children, style, sx, column, overflowHidden, ...rest } = props;
  return (
    <div
      {...rest}
      {...mergedSx(
        [
          styles.container,
          column && styles.containerColumn,
          overflowHidden && styles.containerOverflowHidden,
          sx,
        ],
        className,
        style,
      )}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container>Row layout</Container>
      <Container column>Column layout</Container>
      <Container column overflowHidden>
        Column overflow hidden
      </Container>
    </div>
  );
}

const styles = stylex.create({
  container: {
    display: "flex",
    flexDirection: "row",
    padding: 8,
    backgroundColor: "#f0f5ff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#6a7ab5",
  },
  containerColumn: {
    flexDirection: "column",
  },
  containerOverflowHidden: {
    overflow: "hidden",
  },
});
