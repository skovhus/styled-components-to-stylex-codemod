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

export function ContainerLink(props: Omit<React.ComponentProps<"a">, "className" | "style">) {
  const { children, ...rest } = props;
  return (
    <a {...rest} sx={stylex.defaultMarker()}>
      {children}
    </a>
  );
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
  contentInContainerLink: {
    outline: {
      default: null,
      [stylex.when.ancestor(":focus-visible")]: `10px solid ${$colors.labelBase}`,
    },
    outlineOffset: {
      default: null,
      [stylex.when.ancestor(":focus-visible")]: 5,
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
});
