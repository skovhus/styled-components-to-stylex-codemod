/**
 * Test case for descendant component selectors.
 * Demonstrates the `&:pseudo ${Component}` pattern being transformed to `stylex.when.ancestor()`.
 *
 * Also tests that interpolations with static suffixes preserve the correct order:
 * - `2px solid ${color}` should NOT become `2px solid ${color}` (prefix only)
 * - `${color} dashed` should correctly become `${color} dashed` (suffix preserved)
 */
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export function ContainerLink(
  props: Omit<React.ComponentProps<"a">, "className" | "style" | "sx">,
) {
  return <a {...props} sx={stylex.defaultMarker()} />;
}

export const App = () => (
  <div>
    <button sx={[styles.button, stylex.defaultMarker()]}>
      Click me
      <span sx={[styles.icon, styles.iconInButton]} />
    </button>
    <br />
    <br />
    <ContainerLink href="#">
      <div sx={[styles.content, styles.contentInContainerLink]} />
    </ContainerLink>
    <br />
    <br />
    <div sx={stylex.defaultMarker()}>
      <div sx={[styles.shadowBox, styles.shadowBoxInShadowContainer]} />
    </div>
    <br />
    <br />
    <div tabIndex={0} sx={[styles.hoverFocusContainer, stylex.defaultMarker()]}>
      Grouped parent pseudos
      <span sx={[styles.moreActionsIcon, styles.moreActionsIconInHoverFocusContainer]} />
    </div>
    <br />
    <br />
    <div>
      <a href="#" sx={[styles.nestedLink, styles.nestedLinkInNestedRow]}>
        Nested link
      </a>
    </div>
  </div>
);

const styles = stylex.create({
  content: {
    backgroundColor: $colors.bgSub,
    width: 100,
    height: 100,
  },
  // Test: interpolation with static suffix (e.g., `0 4px 8px ${color}`)
  shadowBox: {
    width: 50,
    height: 50,
    backgroundColor: "white",
  },
  icon: {
    display: "inline-block",
    width: 16,
    height: 16,
    backgroundColor: "currentColor",
    maskSize: "contain",
    borderRadius: "50%",
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "#BF4F74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: 4,
  },
  moreActionsIcon: {
    display: "inline-block",
    width: 12,
    height: 12,
    backgroundColor: "currentColor",
    borderRadius: 999,
  },
  hoverFocusContainer: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 8,
    backgroundColor: "#f5f5f5",
    color: {
      default: "#333",
      ":hover": "#111",
      ":focus-within": "#111",
    },
  },
  nestedLink: {
    color: "#2563eb",
  },
  contentInContainerLink: {
    outline: {
      default: null,
      [stylex.when.ancestor(":focus-visible")]: `10px solid ${$colors.labelBase}`,
    },
    outlineOffset: {
      default: null,
      [stylex.when.ancestor(":focus-visible")]: "5px",
    },
  },
  shadowBoxInShadowContainer: {
    boxShadow: {
      default: null,
      [stylex.when.ancestor(":hover")]: `0 4px 8px ${$colors.labelBase}`,
    },
  },
  iconInButton: {
    width: 20,
    height: 20,
    opacity: {
      default: 0.8,
      [stylex.when.ancestor(":hover")]: 1,
    },
    transform: {
      default: null,
      [stylex.when.ancestor(":hover")]: "scale(1.1)",
    },
  },
  moreActionsIconInHoverFocusContainer: {
    transform: "scale(0.75)",
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
      [stylex.when.ancestor(":focus-within")]: 1,
    },
  },
  nestedLinkInNestedRow: {
    display: "flex",
  },
});
