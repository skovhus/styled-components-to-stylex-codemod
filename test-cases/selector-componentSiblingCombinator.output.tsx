import * as stylex from "@stylexjs/stylex";
import { LinkMarker } from "./selector-componentSiblingCombinator.input.stylex";

export const App = () => (
  <div>
    <a href="#" sx={[styles.link, LinkMarker]}>
      Link
    </a>
    <span sx={styles.badge}>
      Badge (blue when Link is focused, lightyellow bg on hover at 768px+)
    </span>
  </div>
);

const styles = stylex.create({
  link: {
    display: "flex",
    padding: 8,
    backgroundColor: "papayawhip",
  },
  // ${Link}:focus-visible + & uses a sibling combinator between the
  // component and self. This is NOT an ancestor relationship, so
  // stylex.when.ancestor() would produce incorrect semantics.
  badge: {
    paddingBlock: 4,
    paddingInline: 8,
    color: {
      default: "gray",
      [stylex.when.siblingBefore(":focus-visible", LinkMarker)]: "blue",
    },
    backgroundColor: {
      default: null,

      [stylex.when.siblingBefore(":hover", LinkMarker)]: {
        default: null,
        "@media (min-width: 768px)": "lightyellow",
      },
    },
  },
});
