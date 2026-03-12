import * as stylex from "@stylexjs/stylex";
import { CrossFileIcon } from "./lib/cross-file-icon.styled";

export function App() {
  return (
    <div style={{ padding: 16 }}>
      <div sx={styles.card}>
        <CrossFileIcon {...stylex.props(styles.crossFileIconInCard)} />
        Base only
      </div>
    </div>
  );
}

const styles = stylex.create({
  card: {
    padding: 16,
    backgroundColor: "#fafafa",
  },
  crossFileIconInCard: {
    width: 24,
    height: 24,
  },
});
