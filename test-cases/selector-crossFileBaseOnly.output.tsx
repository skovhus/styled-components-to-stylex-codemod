import * as stylex from "@stylexjs/stylex";
import { CrossFileIcon } from "./lib/cross-file-icon.styled";

import { __CardMarker } from "./selector-crossFileBaseOnly.input.stylex";

export function App() {
  return (
    <div style={{ padding: 16 }}>
      <div {...stylex.props(styles.card, __CardMarker)}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInCard)} />
        Base only
      </div>
    </div>
  );
}

const styles = stylex.create({
  card: {
    padding: "16px",
    backgroundColor: "#fafafa",
  },
  crossFileIconInCard: {
    width: "24px",
    height: "24px",
  },
});
