import * as stylex from "@stylexjs/stylex";
import { CrossFileIcon, TruncatedLabel } from "./lib/cross-file-icon.styled";

import {
  IconButtonMarker,
  HoverFocusButtonMarker,
  CloneButtonMarker,
  LabelButtonMarker,
} from "./markers.stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16, width: 620 }}>
      <CrossFileIcon />
      <button sx={[styles.button, styles.iconButton, IconButtonMarker]}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInIconButton)} />
        Hover
      </button>
      <button sx={[styles.button, styles.hoverFocusButton, HoverFocusButtonMarker]}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInHoverFocusButton)} />
        Hover or focus
      </button>
      <button sx={[styles.button, styles.cloneButton, CloneButtonMarker]}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInCloneButton)} />
        Clone
      </button>
      <button sx={[styles.button, styles.labelButton, LabelButtonMarker]}>
        <TruncatedLabel {...stylex.props(styles.truncatedLabelInLabelButton)}>
          Exported selector label
        </TruncatedLabel>
      </button>
    </div>
  );
}

const styles = stylex.create({
  button: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor: "#f0f0f0",
    cursor: "pointer",
  },
  iconButton: {
    gap: 8,
  },
  // Grouped parent pseudos AND a base rule that sets the SAME property as the
  // grouped-pseudo rule. The base value (opacity: 0) must survive as `default`.
  hoverFocusButton: {
    gap: 8,
  },
  cloneButton: {},
  labelButton: {},
  crossFileIconInIconButton: {
    width: 30,
    height: 30,
    transition: "transform 0.2s",
    transform: {
      default: null,
      [stylex.when.ancestor(":hover", IconButtonMarker)]: "rotate(180deg)",
    },
  },
  crossFileIconInHoverFocusButton: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover", HoverFocusButtonMarker)]: 1,
      [stylex.when.ancestor(":focus-within", HoverFocusButtonMarker)]: 1,
    },
  },
  crossFileIconInCloneButton: {
    backgroundColor: {
      default: null,
      [stylex.when.ancestor(":is(*)", CloneButtonMarker)]: "transparent !important",
    },
  },
  truncatedLabelInLabelButton: {
    color: {
      default: "#475569",
      [stylex.when.ancestor(":hover", LabelButtonMarker)]: "#0f172a",
    },
    textDecorationLine: {
      default: null,
      [stylex.when.ancestor(":hover", LabelButtonMarker)]: "underline",
    },
  },
});
