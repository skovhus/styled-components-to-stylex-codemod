// Exported styled component should include ref in its type and forward it.
import * as React from "react";
import styled from "styled-components";

export const StyledInput = styled.input`
  padding: 0.5em;
  margin: 0.5em;
  color: #bf4f74;
  background: papayawhip;
  border: none;
  border-radius: 3px;
`;

export const StyledDiv = styled.div`
  padding: 16px;
  background: #f0f0f0;
  border: 1px solid #ccc;
`;

export const App = () => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const divRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
      <StyledInput ref={inputRef} placeholder="Focused on mount" />
      <StyledDiv ref={divRef}>Div with ref</StyledDiv>
    </div>
  );
};
