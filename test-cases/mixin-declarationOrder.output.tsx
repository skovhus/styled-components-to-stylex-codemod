import * as stylex from "@stylexjs/stylex";
import React from "react";

const styles = stylex.create({
  fallback: {
    display: "flex",
    height: "100%",
  },
});

function StyledFallback({ children }: { children?: React.ReactNode }) {
  return <div sx={styles.fallback}>{children}</div>;
}

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
