import * as React from "react";
import styled from "styled-components";

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

// When styled(Component) is used without explicit children handling,
// the wrapper should still accept children since they are passed through via ...rest
// Exported styled components should preserve wrapper function
export const Container = styled(Flex)`
  width: 480px;
  max-width: calc(100vw - 32px);
  margin: 48px;
  background-color: white;
  border-radius: 8px;
`;

// Container should accept children since Flex accepts children
export const App = () => (
  <Container gap={12} column>
    <div>Child 1</div>
    <div>Child 2</div>
    <div>Child 3</div>
  </Container>
);
