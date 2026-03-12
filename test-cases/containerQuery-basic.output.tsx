import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div sx={styles.container}>
    <div sx={styles.responsiveItem}>Visible when container &gt; 300px</div>
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
