import * as stylex from "@stylexjs/stylex";
import { CrossFileIcon } from "./lib/cross-file-icon.styled";

import { ButtonAMarker, ButtonBMarker } from "./selector-crossFileTwoParents.input.stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <button {...stylex.props(styles.buttonA, ButtonAMarker)}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInButtonA)} />
        Parent A
      </button>
      <button {...stylex.props(styles.buttonB, ButtonBMarker)}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInButtonB)} />
        Parent B
      </button>
    </div>
  );
}

const styles = stylex.create({
  buttonA: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "#e8f4e8",
  },
  buttonB: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "#e8e8f4",
  },
  crossFileIconInButtonA: {
    backgroundColor: "red",
  },
  crossFileIconInButtonB: {
    backgroundColor: "blue",
  },
});
