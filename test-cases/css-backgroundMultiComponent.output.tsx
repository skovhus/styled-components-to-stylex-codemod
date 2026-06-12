import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <div sx={styles.banner}>Background shorthand</div>
    <div sx={styles.tile}>Tile shorthand</div>
  </div>
);

const styles = stylex.create({
  banner: {
    backgroundColor: "#f7f7ff",
    backgroundImage: 'url("/asset.svg")',
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    backgroundSize: "cover",
    color: "#111",
    padding: 16,
  },
  tile: {
    backgroundColor: "peachpuff",
    backgroundRepeat: "repeat-x",
    backgroundAttachment: "fixed",
    backgroundPosition: "left top",
    padding: 16,
  },
});
