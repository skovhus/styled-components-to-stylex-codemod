import * as stylex from "@stylexjs/stylex";

export const App = () => <div sx={styles.box}>Logical scroll longhand</div>;

const styles = stylex.create({
  box: {
    scrollPaddingInlineStart: 7,
    scrollPaddingInlineEnd: 7,
    /* Function values keep their internal whitespace intact (no naive split). */
    scrollMarginInlineStart: "max(4px, 1vw)",
    scrollMarginInlineEnd: 8,
    scrollPaddingBlockStart: "calc(1px + 2px)",
    scrollPaddingBlockEnd: "calc(1px + 2px)",
    backgroundColor: "lavender",
    padding: 16,
  },
});
