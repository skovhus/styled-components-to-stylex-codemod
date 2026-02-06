import React from "react";
import styled from "styled-components";

function Button(props: { onClick: () => void; children: React.ReactNode; variant?: string }) {
  return <button onClick={props.onClick}>{props.children}</button>;
}

export const StyledButton = styled(Button)`
  padding: 8px 16px;
  border-radius: 4px;
  background-color: blue;
  color: white;
`;

export const App = () => (
  <StyledButton onClick={() => {}} variant="primary">
    Click me
  </StyledButton>
);
