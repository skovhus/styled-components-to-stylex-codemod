/**
 * Test case for descendant component selectors.
 * Demonstrates the `&:pseudo ${Component}` pattern being transformed to `stylex.when.ancestor()`.
 */
import * as React from "react";

import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
type ContainerLinkProps = React.PropsWithChildren<{}>;

export function ContainerLink(props: ContainerLinkProps) {
  const { children } = props;
  return <a {...stylex.props(stylex.defaultMarker())}>{children}</a>;
}

export const App = () => (
  <div>
    <button {...stylex.props(styles.button, stylex.defaultMarker())}>
      Click me
      <span {...stylex.props(styles.icon, styles.iconInButton)} />
    </button>
    <br />
    <ContainerLink>
      <div {...stylex.props(styles.content, styles.contentInContainerLink)} />
    </ContainerLink>
  </div>
);

const styles = stylex.create({
  content: {
    backgroundColor: themeVars.bgSub,
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
      [stylex.when.ancestor(":focus-visible")]: `2px solid ${themeVars.labelBase}`,
    },
    outlineOffset: {
      default: null,
      [stylex.when.ancestor(":focus-visible")]: "2px",
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
