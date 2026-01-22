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
import { themeVars } from "./tokens.stylex";
type ContainerLinkProps = Omit<React.ComponentProps<"a">, "className" | "style">;

export function ContainerLink(props: ContainerLinkProps) {
  const { children, ...rest } = props;
  return (
    <a {...rest} {...stylex.props(stylex.defaultMarker())}>
      {children}
    </a>
  );
}

export const App = () => (
  <div>
    <button {...stylex.props(styles.button, stylex.defaultMarker())}>
      Click me
      <span {...stylex.props(styles.icon, styles.iconInButton)} />
    </button>
    <br />
    <br />
    <ContainerLink href="#">
      <div {...stylex.props(styles.content, styles.contentInContainerLink)} />
    </ContainerLink>
    <br />
    <br />
    <div {...stylex.props(stylex.defaultMarker())}>
      <div {...stylex.props(styles.shadowBox, styles.shadowBoxInShadowContainer)} />
    </div>
  </div>
);

const styles = stylex.create({
  content: {
    backgroundColor: themeVars.bgSub,
    width: "100px",
    height: "100px",
  },

  // Test: interpolation with static suffix (e.g., `0 4px 8px ${color}`)
  shadowBox: {
    width: "50px",
    height: "50px",
    backgroundColor: "white",
  },
  icon: {
    display: "inline-block",
    width: "16px",
    height: "16px",
    backgroundColor: "currentColor",
    maskSize: "contain",
    borderRadius: "50%",
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "#BF4F74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  contentInContainerLink: {
    outline: {
      default: null,
      [stylex.when.ancestor(":focus-visible")]: `10px solid ${themeVars.labelBase}`,
    },
    outlineOffset: {
      default: null,
      [stylex.when.ancestor(":focus-visible")]: "5px",
    },
  },
  shadowBoxInShadowContainer: {
    boxShadow: {
      default: null,
      [stylex.when.ancestor(":hover")]: `0 4px 8px ${themeVars.labelBase}`,
    },
  },
  iconInButton: {
    opacity: {
      default: 0.8,
      [stylex.when.ancestor(":hover")]: 1,
    },
    transform: {
      default: null,
      [stylex.when.ancestor(":hover")]: "scale(1.1)",
    },
    width: "20px",
    height: "20px",
  },
});
