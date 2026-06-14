import * as stylex from "@stylexjs/stylex";
import { PageSizeConstants } from "./lib/pageSizes.stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <div sx={styles.box}>Imported shorthand unit</div>
    <div sx={styles.paddedBox}>Padded shorthand unit</div>
  </div>
);

const styles = stylex.create({
  box: {
    margin: PageSizeConstants.listInitiativeRowHeight,
    backgroundColor: "peachpuff",
  },
  paddedBox: {
    padding: PageSizeConstants.listInitiativeRowHeight,
    backgroundColor: "lavender",
  },
});
