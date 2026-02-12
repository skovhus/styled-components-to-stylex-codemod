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
    backgroundColor: $colors.bgSub,
    backgroundImage: $colors.bgSub,
    width: "100px",
    height: "100px",
  },
  // Test: interpolation with static suffix (e.g., `0 4px 8px ${color}`)
  shadowBox: {
    width: "50px",
    height: "50px",
    backgroundColor: "white",
    backgroundImage: "none",
  },
  icon: {
    display: "inline-block",
    width: "16px",
    height: "16px",
    backgroundColor: "currentColor",
    backgroundImage: "none",
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
    backgroundImage: "none",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "currentcolor",
    borderRadius: "4px",
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
    width: "20px",
    height: "20px",
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
