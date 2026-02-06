import styled from "styled-components";
import React from "react";

// Bug: When externalInterface returns { styles: true } and the wrapped component
// doesn't have className/style in its props type, the codemod generates code that
// destructures these props, causing:
// TS2339: Property 'className' does not exist on type 'LoadingProps'.
// TS2339: Property 'style' does not exist on type 'LoadingProps'.
//
// This happens when the adapter is configured with externalInterface: () => ({ styles: true })
// like in a real-world app codemod.

type LoadingProps = {
  delay?: number;
};

function Loading(props: LoadingProps) {
  return <div>Loading...</div>;
}

// Exported styled component with external styles enabled will destructure className/style
export const StyledLoading = styled(Loading)`
  height: 100%;
`;

export const App = () => <StyledLoading delay={1000} />;
