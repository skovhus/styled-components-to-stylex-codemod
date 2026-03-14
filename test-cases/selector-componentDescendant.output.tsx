import * as stylex from "@stylexjs/stylex";
import { WrapperMarker } from "./selector-componentDescendant.input.stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <div sx={styles.child}>Outside Wrapper (gray)</div>
    <div sx={[styles.wrapper, WrapperMarker, stylex.defaultMarker()]}>
      <div sx={[styles.child, styles.childInWrapper]}>Inside Wrapper (blue, lavender)</div>
      <div sx={[styles.combined, styles.combinedInWrapper]}>
        Inside Wrapper (hover=red, bg=lavender)
      </div>
      <div sx={[styles.pseudoOnly, styles.pseudoOnlyInWrapper]}>Inside Wrapper (hover=green)</div>
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
  // Both pseudo and no-pseudo reverse on the same parent: the no-pseudo rule
  // targets the same override key as the pseudo rule. The marker must be set
  // on the existing override, not only when creating new ones.
  combined: {
    color: "gray",
    padding: 8,
  },
  // Regular pseudo reverse only — needs defaultMarker() on Wrapper alongside
  // the scoped WrapperMarker from the no-pseudo patterns above
  pseudoOnly: {
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
  combinedInWrapper: {
    color: {
      default: "gray",
      [stylex.when.ancestor(":hover", WrapperMarker)]: "red",
    },
    backgroundColor: {
      default: null,
      [stylex.when.ancestor(":is(*)", WrapperMarker)]: "lavender",
    },
  },
  pseudoOnlyInWrapper: {
    color: {
      default: "gray",
      [stylex.when.ancestor(":hover")]: "green",
    },
  },
});
