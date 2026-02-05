import * as stylex from "@stylexjs/stylex";
import React from "react";

const styles = stylex.create({
  styledFallback: {
    display: "flex",
    height: "100%",
  },
});

// Simulate a HOC that takes options
const withFallback = <T extends object>(
  Component: React.ComponentType<T>,
  options: { fallback: React.ReactNode },
) => Component;

export const MyComponent = withFallback(
  function MyComponent_() {
    return <div>Hello</div>;
  },
  { fallback: <div {...stylex.props(styles.styledFallback)}>Loading...</div> },
);

export const App = () => <MyComponent />;
