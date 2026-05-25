import * as stylex from "@stylexjs/stylex";
import { CrossFileIcon, CrossFileLink, TruncatedLabel } from "./lib/cross-file-icon.styled";

import {
  IconButtonMarker,
  HoverFocusButtonMarker,
  LabelButtonMarker,
  ExternalSummaryMarker,
} from "./markers.stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16, width: 760 }}>
      <CrossFileIcon />
      <button sx={[styles.button, styles.iconButton, IconButtonMarker]}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInIconButton)} />
        Hover
      </button>
      <button sx={[styles.button, styles.hoverFocusButton, HoverFocusButtonMarker]}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInHoverFocusButton)} />
        Hover or focus
      </button>
      <button sx={styles.button}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInCloneButton)} />
        Clone
      </button>
      <button sx={[styles.button, LabelButtonMarker]}>
        <TruncatedLabel {...stylex.props(styles.truncatedLabelInLabelButton)}>
          Exported selector label
        </TruncatedLabel>
      </button>
      <div sx={[styles.externalSummary, ExternalSummaryMarker]}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInExternalSummary)} />
        <CrossFileLink href="#" {...stylex.props(styles.crossFileLinkInExternalSummary)}>
          External link
        </CrossFileLink>
      </div>
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
  externalSummary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#cbd5e1",
  },
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
    backgroundColor: "transparent !important",
  },
  truncatedLabelInLabelButton: {
    color: {
      default: "#475569",
      [stylex.when.ancestor(":hover", LabelButtonMarker)]: "#0f172a",
    },
    textDecoration: {
      default: null,
      [stylex.when.ancestor(":hover", LabelButtonMarker)]: "underline",
    },
  },
  crossFileIconInExternalSummary: {
    width: 20,
    height: 20,
    transform: {
      default: null,
      [stylex.when.ancestor(":hover", ExternalSummaryMarker)]: "scale(1.2)",
    },
  },
  crossFileLinkInExternalSummary: {
    color: {
      default: "#2563eb",
      [stylex.when.ancestor(":hover", ExternalSummaryMarker)]: "#1d4ed8",
    },
    textDecoration: {
      default: "none",
      [stylex.when.ancestor(":hover", ExternalSummaryMarker)]: "underline",
    },
  },
});
