import * as stylex from "@stylexjs/stylex";

export const App = () => <div sx={styles.chartCell}>Chart cell</div>;

const styles = stylex.create({
  chartCell: {
    display: "grid",
    gridRow: {
      default: "2",
      "@media (max-width: 640px)": "unset",
    },
    backgroundColor: "#dbeafe",
    padding: 8,
  },
});
