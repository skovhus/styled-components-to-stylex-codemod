import React from "react";

// Minimal stub of `@react-spring/web` used by fixtures.
// We keep this local so Storybook (and the repo) doesn't need the real dependency.
export const animated = {
  div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div ref={ref} {...props} />
  )),
  path: React.forwardRef<SVGPathElement, React.SVGProps<SVGPathElement>>((props, ref) => (
    <path ref={ref} {...props} />
  )),
};

export function useSpring<T extends Record<string, unknown>>(
  config: () => T,
): [T, { start: () => void }] {
  return [config(), { start: () => {} }];
}
