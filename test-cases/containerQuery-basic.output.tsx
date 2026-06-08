import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

export const App = () => (
  <div sx={styles.container}>
    <div sx={styles.responsiveItem}>Visible when container &gt; 300px</div>
    <div sx={styles.wrappingRow}>
      <span>Container</span>
      <span>wraps</span>
    </div>
    <div
      sx={[styles.wrappingRowAfterHelper, helpers.flexCenter, styles.wrappingRowAfterHelperAfter1]}
    >
      <span>Helper</span>
      <span>wraps</span>
    </div>
  </div>
);

const styles = stylex.create({
  // Show/hide based on container width
  responsiveItem: {
    display: {
      default: "none",
      "@container sidebar (min-width: 300px)": "flex",
    },
  },
  wrappingRow: {
    display: "flex",
    flexWrap: {
      default: "nowrap",
      "@container sidebar (max-width: 240px)": "wrap",
    },
    gap: 8,
  },
  wrappingRowAfterHelper: {
    display: "flex",
  },
  wrappingRowAfterHelperAfter1: {
    gap: 8,
    flexWrap: {
      default: "nowrap",
      "@container sidebar (max-width: 240px)": "wrap",
    },
  },
  // Container context
  container: {
    containerName: "sidebar",
    containerType: "inline-size",
    width: "100%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    padding: 16,
  },
});
