import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ padding: 16 }}>
    <input type="file" sx={styles.fileInput} />
  </div>
);

const styles = stylex.create({
  fileInput: {
    display: "none",
    visibility: "hidden",
    "::-webkit-file-upload-button": {
      display: "none",
      visibility: "hidden",
    },
  },
});
