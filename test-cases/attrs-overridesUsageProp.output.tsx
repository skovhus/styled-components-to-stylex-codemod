import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type StyledBoxProps = React.PropsWithChildren<{
  color?: string;
}>;

function StyledBox(props: StyledBoxProps) {
  const { children, ...rest } = props;
  return (
    <div {...rest} color="crimson" sx={styles.box}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    {/* Renders crimson — attrs override the dodgerblue passed at usage */}
    <StyledBox color="dodgerblue">attrs wins (crimson)</StyledBox>
    {/* Renders crimson — no conflict, attrs applied */}
    <StyledBox>attrs default (crimson)</StyledBox>
  </div>
);

const styles = stylex.create({
  box: {
    backgroundColor: "crimson",
    color: "white",
    paddingBlock: 16,
    paddingInline: 24,
    borderRadius: 4,
    fontWeight: 600,
  },
});
