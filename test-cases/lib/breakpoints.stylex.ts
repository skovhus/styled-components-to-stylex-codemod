import * as stylex from "@stylexjs/stylex";

export const breakpoints = stylex.defineConsts({
  /** Media query to target only phones-sized screens (matches helpers.ts screenSize.phone). */
  phone: "@media (max-width: 640px)",
  /** Media query to target only tablet-sized screens and lower (matches helpers.ts screenSize.tablet). */
  tablet: "@media (max-width: 768px)",
});
