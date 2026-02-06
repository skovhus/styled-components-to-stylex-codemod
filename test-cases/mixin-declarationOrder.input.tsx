import styled from "styled-components";
import React from "react";

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

export const App = () => (
  <div>
    <StyledFallback>Fallback content</StyledFallback>
    <MyComponent />
  </div>
);
