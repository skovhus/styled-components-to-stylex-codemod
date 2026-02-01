import * as React from "react";
import styled from "styled-components";

// When a local variable named `styles` exists, the generated stylex constant
// should use a different name to avoid shadowing.

const Container = styled.div`
  position: relative;
  flex-shrink: 0;
`;

interface Props {
  containerStyles?: React.CSSProperties;
  children: React.ReactNode;
}

export function CollapsingContainer(props: Props) {
  const { containerStyles, children } = props;

  // Local variable named "styles" - common pattern in animation components
  const styles = containerStyles
    ? {
        overflow: "hidden",
        ...containerStyles,
      }
    : { overflow: "hidden" };

  return <Container>{children}</Container>;
}

export const App = () => (
  <CollapsingContainer containerStyles={{ padding: 10 }}>Content</CollapsingContainer>
);
