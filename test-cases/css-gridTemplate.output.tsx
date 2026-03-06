import React from "react";
import * as stylex from "@stylexjs/stylex";

function Gutter(props: React.PropsWithChildren<{}>) {
  return <div sx={styles.gutter}>{props.children}</div>;
}

function Code(props: React.PropsWithChildren<{}>) {
  return <div sx={styles.code}>{props.children}</div>;
}

export const App = () => (
  <div sx={styles.container}>
    <Gutter>1</Gutter>
    <Code>const answer = 42;</Code>
    <Gutter>2</Gutter>
    <Code>function add(a, b) {"{"}</Code>
    <Gutter>3</Gutter>
    <Code>{"  "}return a + b;</Code>
    <Gutter>4</Gutter>
    <Code>{"}"}</Code>
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
