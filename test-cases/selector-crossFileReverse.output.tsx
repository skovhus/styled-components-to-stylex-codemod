import * as stylex from "@stylexjs/stylex";
import { CrossFileLink } from "./lib/cross-file-icon.styled";

import { __CrossFileLinkMarker } from "./selector-crossFileReverse.input.stylex";

export function App() {
  return (
    <div style={{ padding: 16 }}>
      <CrossFileLink href="#" {...stylex.props(__CrossFileLinkMarker)}>
        <span {...stylex.props(styles.badge, styles.badgeInCrossFileLink)} />
        Hover me
      </CrossFileLink>
    </div>
  );
}

const styles = stylex.create({
  badge: {
    display: "inline-block",
    width: "20px",
    height: "20px",
    backgroundColor: "gray",
    transition: "background-color 0.25s",
  },
  badgeInCrossFileLink: {
    backgroundColor: {
      default: "gray",
      [stylex.when.ancestor(":hover", __CrossFileLinkMarker)]: "rebeccapurple",
    },
  },
});
