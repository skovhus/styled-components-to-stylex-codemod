import React from "react";
import * as stylex from "@stylexjs/stylex";
import { LinkMarker } from "./selector-componentSiblingCombinator.input.stylex";

function Link(props: Pick<React.ComponentProps<"a">, "children" | "href">) {
  const { children, ...rest } = props;
  return (
    <a {...rest} sx={[styles.link, LinkMarker, stylex.defaultMarker()]}>
      {children}
    </a>
  );
}

export const App = () => (
  <div>
    <Link href="#">Link</Link>
    <span sx={styles.badge}>
      Badge (blue when Link is focused, lightyellow bg on hover at 768px+)
    </span>
    <Link href="#">
      <span sx={[styles.nested, styles.nestedInLink]}>Nested in Link (green on hover)</span>
    </Link>
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
      // TODO(codemod): CSS `+` (adjacent) was broadened to `~` (general sibling). Verify siblings are always adjacent.
      [stylex.when.siblingBefore(":focus-visible", LinkMarker)]: "blue",
    },
    backgroundColor: {
      default: null,
      // TODO(codemod): CSS `+` (adjacent) was broadened to `~` (general sibling). Verify siblings are always adjacent.
      [stylex.when.siblingBefore(":hover", LinkMarker)]: {
        default: null,
        "@media (min-width: 768px)": "lightyellow",
      },
    },
  },
  // Mixed: same Link used as both sibling target AND ancestor reverse.
  // Link needs both LinkMarker (for sibling) and defaultMarker() (for ancestor).
  nested: {
    color: "gray",
    paddingBlock: 4,
    paddingInline: 8,
  },
  nestedInLink: {
    color: {
      default: "gray",
      [stylex.when.ancestor(":hover")]: "green",
    },
  },
});
