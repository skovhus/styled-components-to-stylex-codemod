import * as stylex from "@stylexjs/stylex";
import { WrapperMarker } from "./selector-componentDescendant.input.stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <div sx={styles.child}>Outside Wrapper (gray)</div>
    <div sx={[styles.wrapper, WrapperMarker]}>
      <div sx={[styles.child, styles.childInWrapper]}>Inside Wrapper (blue, lavender)</div>
    </div>
  </div>
);

const styles = stylex.create({
  wrapper: {
    padding: 16,
    backgroundColor: "papayawhip",
  },
  child: {
    color: "gray",
    padding: 8,
  },
  childInWrapper: {
    color: {
      default: "gray",
      [stylex.when.ancestor(":is(*)", WrapperMarker)]: "blue",
    },
    backgroundColor: {
      default: null,
      [stylex.when.ancestor(":is(*)", WrapperMarker)]: "lavender",
    },
  },
});
