import * as stylex from "@stylexjs/stylex";
import electronStyles from "./lib/electronMixins.module.css";

export function App() {
  return (
    <div sx={styles.draggableBar} className={electronStyles.draggableRegionDisableChildren}>
      Draggable
    </div>
  );
}

const styles = stylex.create({
  draggableBar: {
    pointerEvents: "all",
    color: {
      default: null,
      ":hover": "white",
    },
  },
});
