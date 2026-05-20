import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

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

type ClassNameBoxProps = React.PropsWithChildren<{
  className?: string;
  sx?: stylex.StyleXStyles;
}>;

function ClassNameBox(props: ClassNameBoxProps) {
  const { className, children, sx } = props;
  return (
    <div
      {...mergedSx(
        [styles.classNameBox, className != null && styles.classNameBoxColor(className), sx],
        ["static-class", className],
      )}
    >
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
    {/* className remains dynamic because attrs className is merged, not overwritten */}
    <ClassNameBox className="external-class">className stays dynamic</ClassNameBox>
    <ClassNameBox>static className still merges</ClassNameBox>
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
  classNameBox: {
    backgroundColor: "#f6f6f6",
    paddingBlock: 16,
    paddingInline: 24,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#222",
    borderRadius: 4,
  },
  classNameBoxColor: (color: string) => ({
    color,
  }),
});
