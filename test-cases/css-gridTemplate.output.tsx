import * as stylex from "@stylexjs/stylex";

export const App = ({ highlightRow }: { highlightRow: string }) => (
  <div sx={styles.container}>
    <div sx={styles.gutter}>1</div>
    <div sx={styles.code}>const answer = 42;</div>
    <div sx={styles.gutter}>2</div>
    <div sx={styles.code}>function add(a, b) {"{"}</div>
    <div sx={styles.gutter}>3</div>
    <div sx={styles.code}>{"  "}return a + b;</div>
    <div sx={styles.gutter}>4</div>
    <div sx={styles.code}>{"}"}</div>
    <div sx={[styles.gutter, styles.gutterDynamic(highlightRow)]}>*</div>
    <div sx={[styles.code, styles.codeHighlighted]}>highlighted</div>
  </div>
);

const styles = stylex.create({
  container: {
    display: "grid",
    position: "relative",
    gridTemplateColumns: "[gutter] var(--line-number-width, 50px) [code] minmax(0, 1fr)",
    gridAutoRows: "minmax(0px, auto)",
    gap: "4px 8px",
    padding: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
  },
  gutter: {
    backgroundColor: "#f3f3f3",
    color: "#666",
    textAlign: "right",
    paddingBlock: 4,
    paddingInline: 6,
    fontFamily:
      'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
    fontSize: 12,
  },
  code: {
    backgroundColor: "#e7f3ff",
    color: "#0b4f6c",
    paddingBlock: 4,
    paddingInline: 8,
    fontFamily:
      'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
    fontSize: 12,
  },
  gutterDynamic: (gridRow: string) => ({
    gridRow,
  }),
  codeHighlighted: {
    gridRow: "2",
  },
});
