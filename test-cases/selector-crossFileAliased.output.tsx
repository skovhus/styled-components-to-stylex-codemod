import * as stylex from "@stylexjs/stylex";
import { CrossFileIcon as Arrow } from "./lib/cross-file-icon.styled";

export function App() {
  return (
    <div style={{ padding: 16 }}>
      <div sx={styles.card}>
        <Arrow {...stylex.props(styles.arrowInCard)} />
        Aliased import
      </div>
    </div>
  );
}

const styles = stylex.create({
  card: {
    padding: "16px",
    backgroundColor: "#fafafa",
  },
  arrowInCard: {
    borderWidth: "5px",
    borderStyle: "solid",
    borderColor: "blue",
  },
});
