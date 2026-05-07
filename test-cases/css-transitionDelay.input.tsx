import React from "react";
import styled from "styled-components";

type ContainerProps = {
  $open?: boolean;
  $delay?: number;
  children?: React.ReactNode;
};

const EASING = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";

/**
 * Test case for transitionDelay with number value.
 * The codemod should convert number 0 to "0ms" string for CSS properties.
 */
const Container = styled.div<ContainerProps>`
  opacity: ${(props) => (props.$open ? 1 : 0)};
  transition: opacity 200ms ease-out;
  transition-delay: ${(props) => (props.$open ? props.$delay : 0)}ms;
  background-color: #3b82f6;
  color: white;
  padding: 16px 20px;
  border-radius: 8px;
`;

const DynamicTransitionPanel = styled.div<{ $visible?: boolean }>`
  opacity: ${(props) => (props.$visible ? 1 : 0)};
  transition: opacity ${(props) => (props.$visible ? 400 : 100)}ms ${EASING};
  padding: 12px;
  background-color: #fef3c7;
`;

export function AutoFadingContainer(props: ContainerProps) {
  const { children, ...rest } = props;
  return <Container {...rest}>{children}</Container>;
}

export const App = () => {
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    const id = window.setInterval(() => setOpen((v) => !v), 1200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div style={{ display: "flex", gap: 12, fontFamily: "system-ui", fontSize: 14 }}>
      <AutoFadingContainer $open={open} $delay={0}>
        0ms delay
      </AutoFadingContainer>
      <AutoFadingContainer $open={open} $delay={200}>
        200ms delay
      </AutoFadingContainer>
      <AutoFadingContainer $open={open} $delay={600}>
        600ms delay
      </AutoFadingContainer>
      <DynamicTransitionPanel $visible={open}>Dynamic shorthand</DynamicTransitionPanel>
    </div>
  );
};
