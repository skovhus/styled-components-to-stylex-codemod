import * as stylex from "@stylexjs/stylex";
import { breakpoints } from "./lib/breakpoints.stylex";

export const App = () => (
  <div>
    <div sx={styles.container}>Responsive container</div>
    <div sx={styles.details}>Details column</div>
  </div>
);

const styles = stylex.create({
  /**
   * This test case uses a media query helper (screenSize.phone) that resolves
   * to a media query string. The adapter's resolveSelector handles this by
   * returning a computed key expression (breakpoints.phone) for StyleX.
   *
   * It also tests that standard @media rules and selector-interpolated helpers
   * can coexist on the same property without one overwriting the other.
   */
  container: {
    width: "100%",

    padding: {
      default: "1rem",
      "@media (min-width: 1024px)": "2rem",
      [breakpoints.phone]: "0.5rem",
    },
  },

  /**
   * Tests that a shorthand override in a media query correctly resets longhand
   * values set at the default level:
   * - Default: padding 0 24px, then padding-bottom: 12px
   * - Phone: padding 0 16px (should reset padding-bottom back to 0)
   */
  details: {
    paddingTop: {
      default: 0,
      [breakpoints.phone]: 0,
    },

    paddingBottom: {
      default: "12px",
      [breakpoints.phone]: 0,
    },

    paddingInline: {
      default: "24px",
      [breakpoints.phone]: "16px",
    },
  },
});
