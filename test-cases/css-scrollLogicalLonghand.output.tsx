import * as stylex from "@stylexjs/stylex";

export const App = () => <div sx={styles.box}>Logical scroll longhand</div>;

const styles = stylex.create({
  box: {
    scrollMarginInlineStart: 6,
    scrollMarginInlineEnd: 4,
    scrollMarginBlock: "10px 12px",
    scrollPaddingBlockStart: 2,
    scrollPaddingBlockEnd: 3,
    scrollPaddingInline: 7,
    backgroundColor: "lavender",
    padding: 16,
  },
});
