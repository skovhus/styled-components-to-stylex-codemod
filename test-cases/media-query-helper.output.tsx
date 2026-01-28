import * as stylex from "@stylexjs/stylex";
import { breakpoints } from "./lib/breakpoints.stylex";

export const App = () => <div {...stylex.props(styles.container)}>Responsive container</div>;

const styles = stylex.create({
  /**
   * This test case uses a media query helper (screenSize.phone) that resolves
   * to a media query string. The adapter's resolveSelector handles this by
   * returning a computed key expression (breakpoints.phone) for StyleX.
   */
  container: {
    width: "100%",
    padding: {
      default: "1rem",
      [breakpoints.phone]: "0.5rem",
    },
  },
});
