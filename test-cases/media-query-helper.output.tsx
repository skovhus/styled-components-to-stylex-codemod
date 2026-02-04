import * as stylex from "@stylexjs/stylex";
import { breakpoints } from "./lib/breakpoints.stylex";

export const App = () => <div {...stylex.props(styles.container)}>Responsive container</div>;

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
});
