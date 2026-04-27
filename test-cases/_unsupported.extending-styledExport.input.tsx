// @expected-warning: styled(ImportedComponent) wraps a component whose file uses styled-components — convert the base component's file first to avoid CSS cascade conflicts
// styled() wrapping a directly-exported styled-component from another file.
// The wrapped Codeblock's unlayered styled-components CSS would beat any layered
// StyleX classes emitted by the wrapper, so the codemod must bail.
import * as React from "react";
import styled from "styled-components";
import { Codeblock } from "./lib/styled-codeblock";

const StyledCodeBlock = styled(Codeblock)<{ $shouldLineWrap?: boolean }>`
  margin-block: 0;
  overflow: visible;
  user-select: text;
  word-break: ${(props) => (props.$shouldLineWrap ? "break-word" : "normal")};
  overflow-wrap: ${(props) => (props.$shouldLineWrap ? "break-word" : "normal")};
  white-space: ${(props) => (props.$shouldLineWrap ? "pre-wrap" : "pre")};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "20px" }}>
    <Codeblock>{"const wrapped = false;\nconst trailing = 'long line that overflows';"}</Codeblock>
    <StyledCodeBlock $shouldLineWrap>
      {"const wrapped = true;\nconst trailing = 'long line that wraps';"}
    </StyledCodeBlock>
  </div>
);
