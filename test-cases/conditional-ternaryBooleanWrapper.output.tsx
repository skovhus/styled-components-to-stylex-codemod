// Boolean ternary on a wrapper component should merge into a single ternary
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

function BaseBox(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

type StyledBoxProps = { inline?: boolean } & Omit<
  React.ComponentPropsWithRef<typeof BaseBox>,
  "className" | "style"
>;

function StyledBox(props: StyledBoxProps) {
  const { children, inline, ...rest } = props;

  return (
    <BaseBox
      {...rest}
      {...stylex.props(styles.box, inline === true ? styles.boxInline : styles.boxNotInline)}
    >
      {children}
    </BaseBox>
  );
}

export function App() {
  return (
    <div style={{ padding: "16px", position: "relative" }}>
      <StyledBox inline>Inline</StyledBox>
      <StyledBox>Block</StyledBox>
    </div>
  );
}

const styles = stylex.create({
  box: {
    color: "red",
  },
  boxInline: {
    paddingBlock: 0,
    paddingInline: 6,
    borderRadius: 4,
    position: "absolute",
  },
  boxNotInline: {
    marginTop: 8,
  },
});
