import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Pattern: styled(Component) wrapping a component that accepts children
// The wrapper must preserve the children prop from the wrapped component

interface BaseDividerProps {
  /** The divider text */
  text: string;
}

/** A divider component that accepts children */
function BaseDivider(props: React.PropsWithChildren<BaseDividerProps>) {
  const { text, children } = props;
  return (
    <div>
      <span>{text}</span>
      {children}
    </div>
  );
}

type StyledDividerProps = Omit<React.ComponentProps<typeof BaseDivider>, "className" | "style">;

export function StyledDivider(props: StyledDividerProps) {
  return <BaseDivider {...props} {...stylex.props(styles.styledDivider)} />;
}

// Usage: children should work
export const App = () => (
  <StyledDivider text="Section">
    <span>Extra content</span>
  </StyledDivider>
);

const styles = stylex.create({
  styledDivider: {
    paddingLeft: "20px",
  },
});
