import * as stylex from "@stylexjs/stylex";
import * as React from "react";

// A component that accepts children
type FlexProps = React.PropsWithChildren<{
  gap?: number;
  column?: boolean;
  className?: string;
  style?: React.CSSProperties;
}>;

function Flex(props: FlexProps) {
  const { gap, column, className, style, children } = props;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: column ? "column" : "row",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type ContainerProps = Omit<React.ComponentProps<typeof Flex>, "className" | "style">;

export function Container(props: ContainerProps) {
  return <Flex {...props} {...stylex.props(styles.container)} />;
}

// Container should accept children since Flex accepts children
export const App = () => (
  <Container gap={12} column>
    <div>Child 1</div>
    <div>Child 2</div>
    <div>Child 3</div>
  </Container>
);

const styles = stylex.create({
  container: {
    width: "480px",
    maxWidth: "calc(100vw - 32px)",
    margin: "48px",
    backgroundColor: "white",
    borderRadius: "8px",
  },
});
