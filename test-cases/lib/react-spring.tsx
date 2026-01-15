import React from "react";

// Minimal stub of `@react-spring/web` used by fixtures.
// We keep this local so Storybook (and the repo) doesn't need the real dependency.
export const animated = {
  div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div ref={ref} {...props} />
  )),
};
