import * as React from "react";
import * as stylex from "@stylexjs/stylex";

interface FlexProps {
  direction?: string;
}

const Flex = (props: FlexProps & React.HTMLAttributes<HTMLDivElement>) => (
  <div style={{ display: "flex", flexDirection: props.direction as any }} {...props} />
);

function StyledFlex(props: Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style">) {
  return <Flex {...props} direction="column" {...stylex.props(styles.flex)} />;
}

export function App() {
  return <StyledFlex>Hello</StyledFlex>;
}

const styles = stylex.create({
  flex: {
    gap: "8px",
    padding: "16px",
  },
});
