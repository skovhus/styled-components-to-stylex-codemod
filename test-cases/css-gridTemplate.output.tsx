import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div {...stylex.props(styles.container)}>
    <div {...stylex.props(styles.gutter)}>1</div>
    <div {...stylex.props(styles.code)}>const answer = 42;</div>
    <div {...stylex.props(styles.gutter)}>2</div>
    <div {...stylex.props(styles.code)}>function add(a, b) {"{"}</div>
    <div {...stylex.props(styles.gutter)}>3</div>
    <div {...stylex.props(styles.code)}>{"  "}return a + b;</div>
    <div {...stylex.props(styles.gutter)}>4</div>
    <div {...stylex.props(styles.code)}>{"}"}</div>
  </div>
);

const styles = stylex.create({
  container: {
    display: "grid",
    position: "relative",
    gridTemplateColumns: "[gutter] var(--line-number-width, 50px) [code] minmax(0, 1fr)",
    gridAutoRows: "minmax(0px, auto)",
    gap: "4px 8px",
    padding: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
  },
  gutter: {
    backgroundColor: "#f3f3f3",
    color: "#666",
    textAlign: "right",
    paddingBlock: "4px",
    paddingInline: "6px",
    fontFamily:
      'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
    fontSize: "12px",
  },
  code: {
    backgroundColor: "#e7f3ff",
    color: "#0b4f6c",
    paddingBlock: "4px",
    paddingInline: "8px",
    fontFamily:
      'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
    fontSize: "12px",
  },
});
