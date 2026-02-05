import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type RowProps = React.PropsWithChildren<{
  ref?: React.Ref<HTMLDivElement>;
  isAdjacentSibling?: any;
}> & { isAdjacentSibling?: boolean };

function Row(props: RowProps) {
  const { children, className, isAdjacentSibling, _unused, ...rest } = props;

  return (
    <div {...rest} {...stylex.props(isAdjacentSibling && styles.adjacentSibling)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Row>First</Row>
    <Row isAdjacentSibling>Second</Row>
  </div>
);

const styles = stylex.create({
  adjacentSibling: {
    marginTop: "16px",
  },
});
