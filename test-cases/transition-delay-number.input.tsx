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
`;

export function AutoFadingContainer(props: ContainerProps) {
  const { children, ...rest } = props;
  return <Container {...rest}>{children}</Container>;
}

export const App = () => (
  <AutoFadingContainer $open={true} $delay={100}>
    Content
  </AutoFadingContainer>
);
