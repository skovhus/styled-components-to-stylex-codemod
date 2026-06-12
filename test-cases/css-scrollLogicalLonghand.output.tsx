import * as stylex from "@stylexjs/stylex";

export const App = () => <div sx={styles.box}>Logical scroll longhand</div>;

const styles = stylex.create({
  box: {
    scrollPaddingBlockStart: 2,
    scrollPaddingBlockEnd: 3,
    scrollPaddingInlineStart: 7,
    scrollPaddingInlineEnd: 7,
    scrollMarginInlineStart: 5,
    scrollMarginInlineEnd: 9,
    backgroundColor: "lavender",
    padding: 16,
  },
});
