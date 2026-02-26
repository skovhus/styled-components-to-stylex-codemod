import React from "react";
import styled from "styled-components";

type ContainerProps = {
  $open?: boolean;
  $delay?: number;
  children?: React.ReactNode;
};

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
    </div>
  );
};
