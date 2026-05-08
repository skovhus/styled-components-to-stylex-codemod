import * as stylex from "@stylexjs/stylex";
import { breakpoints } from "./lib/breakpoints.stylex";

export const App = () => (
  <div>
    <div sx={styles.container}>Responsive container</div>
    <div sx={styles.details}>Details column</div>
    <div sx={styles.minWidthDetails}>Breakpoint value details</div>
  </div>
);

const styles = stylex.create({
  container: {
    width: "100%",
    padding: {
      default: "1rem",
      "@media (min-width: 1024px)": "2rem",
      [breakpoints.phone]: "0.5rem",
    },
  },
  details: {
    paddingTop: {
      default: 0,
      [breakpoints.phone]: 0,
    },
    paddingBottom: {
      default: 12,
      [breakpoints.phone]: 0,
    },
    paddingInline: {
      default: 24,
      [breakpoints.phone]: 16,
    },
  },
  minWidthDetails: {
    padding: {
      default: 8,
      [breakpoints.phoneMin]: 16,
    },
    margin: {
      default: null,
      [breakpoints.phone]: 4,
    },
  },
});
