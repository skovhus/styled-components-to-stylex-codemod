import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <div sx={styles.banner}>Background shorthand</div>
    <div sx={styles.tile}>Tile shorthand</div>
    <div sx={[styles.coloredBase, styles.overlay]}>Overlay reset</div>
  </div>
);

const styles = stylex.create({
  banner: {
    backgroundColor: "#f7f7ff",
    backgroundImage: 'url("/asset.svg")',
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "scroll",
    backgroundPosition: "center",
    backgroundSize: "cover",
    backgroundOrigin: "padding-box",
    backgroundClip: "border-box",
    color: "#111",
    padding: 16,
  },
  tile: {
    backgroundColor: "peachpuff",
    backgroundImage: "none",
    backgroundRepeat: "repeat-x",
    backgroundAttachment: "fixed",
    backgroundPosition: "left top",
    backgroundSize: "auto",
    backgroundOrigin: "padding-box",
    backgroundClip: "border-box",
    padding: 16,
  },
  coloredBase: {
    backgroundColor: "blue",
    padding: 16,
  },
  // The shorthand omits a color component, so the base's blue must reset to
  // transparent rather than leak through the merged StyleX styles.
  overlay: {
    backgroundColor: "transparent",
    backgroundImage: 'url("/asset.svg")',
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "scroll",
    backgroundPosition: "center",
    backgroundSize: "cover",
    backgroundOrigin: "padding-box",
    backgroundClip: "border-box",
  },
});
