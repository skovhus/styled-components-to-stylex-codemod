import styled from "styled-components";

const Container = styled.div`
  display: grid;
  position: relative;
  grid-template-columns: ${() => `
    [gutter] var(--line-number-width, 50px)
    [code] minmax(0, 1fr)
  `};
  grid-auto-rows: minmax(0px, auto);
  gap: 4px 8px;
  padding: 8px;
  border: 1px solid #ccc;
`;

const Gutter = styled.div`
  background: #f3f3f3;
  color: #666;
  text-align: right;
  padding: 4px 6px;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
`;

const Code = styled.div`
  background: #e7f3ff;
  color: #0b4f6c;
  padding: 4px 8px;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
`;

export const App = () => (
  <Container>
    <Gutter>1</Gutter>
    <Code>const answer = 42;</Code>
    <Gutter>2</Gutter>
    <Code>function add(a, b) {"{"}</Code>
    <Gutter>3</Gutter>
    <Code>{"  "}return a + b;</Code>
    <Gutter>4</Gutter>
    <Code>{"}"}</Code>
  </Container>
);
