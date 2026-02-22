import * as stylex from "@stylexjs/stylex";
import { CrossFileIcon } from "./lib/cross-file-icon.styled";

import { IconButtonMarker } from "./selector-crossFileComponent.input.stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <CrossFileIcon />
      <button {...stylex.props(styles.button, styles.iconButton, IconButtonMarker)}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInIconButton)} />
        Hover
      </button>
    </div>
  );
}

const styles = stylex.create({
  button: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: "8px",
    paddingInline: "12px",
    backgroundColor: "#f0f0f0",
    cursor: "pointer",
  },
  iconButton: {
    gap: "8px",
  },
  crossFileIconInIconButton: {
    width: "30px",
    height: "30px",
    transition: "transform 0.2s",
    transform: {
      default: null,
      [stylex.when.ancestor(":hover", IconButtonMarker)]: "rotate(180deg)",
    },
  },
});
