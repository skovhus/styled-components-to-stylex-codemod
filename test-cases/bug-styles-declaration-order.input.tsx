import styled from "styled-components";
import React from "react";

// Bug: The styled component `StyledFallback` is used inside a function argument
// (passed to `withFallback`), not in a JSX return. The codemod must handle styled
// components referenced as values in non-JSX positions without breaking.

const StyledFallback = styled.div`
  display: flex;
  height: 100%;
`;

// Simulate a HOC that takes options
const withFallback = <T extends object>(
  Component: React.ComponentType<T>,
  options: { fallback: React.ReactNode },
) => Component;

export const MyComponent = withFallback(
  function MyComponent_() {
    return <div>Hello</div>;
  },
  { fallback: <StyledFallback>Loading...</StyledFallback> },
);

export const App = () => <MyComponent />;
