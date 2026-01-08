import styled, { css } from "styled-components";

// Pattern 1: css helper used internally
const truncate = css`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Title = styled.h1`
  ${truncate}
  font-size: 1.5em;
  color: #BF4F74;
`;

// Pattern 2: css helper EXPORTED for use in other files
export const codeMarkStyles = css`
  font-family: monospace;
  font-size: 0.9em;
  padding: 0.5px 0.25em;
  border-radius: 0.2em;
  background-color: rgba(0, 0, 0, 0.05);
`;

// Using the exported css helper in a styled component
export const Code = styled.span`
  ${codeMarkStyles}
`;

export const App = () => (
  <div>
    <Title>This is a very long title that will be truncated</Title>
    <Code>const x = 1;</Code>
  </div>
);
