import * as React from "react";
import * as stylex from "@stylexjs/stylex";

function Gutter({ children }: { children?: React.ReactNode }) {
  return <div sx={styles.gutter}>{children}</div>;
}

function Code({ children }: { children?: React.ReactNode }) {
  return <div sx={styles.code}>{children}</div>;
}

export const App = ({ highlightRow = "5" }: { highlightRow?: string }) => (
  <div sx={styles.container} style={containerInlineStyle}>
    <Gutter>1</Gutter>
    <Code>const answer = 42;</Code>
    <Gutter>2</Gutter>
    <Code>function add(a, b) {"{"}</Code>
    <Gutter>3</Gutter>
    <Code>{"  "}return a + b;</Code>
    <Gutter>4</Gutter>
    <Code>{"}"}</Code>
    <div sx={styles.gutter} style={{ gridRow: highlightRow }}>
      *
    </div>
    <div sx={[styles.code, styles.codeHighlighted]}>highlighted</div>
  </div>
);

const containerInlineStyle = {
  gridTemplateColumns: "[gutter] var(--line-number-width, 50px) [code] minmax(0, 1fr)",
} satisfies React.CSSProperties;

const styles = stylex.create({
  container: {
    display: "grid",
    position: "relative",
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
  codeHighlighted: {
    gridRow: "2",
  },
});
