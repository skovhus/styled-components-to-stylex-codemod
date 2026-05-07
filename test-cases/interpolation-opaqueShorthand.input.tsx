// Directional expansion for opaque shorthand theme tokens
import * as React from "react";
import styled from "styled-components";

type PlainInputProps = React.ComponentPropsWithoutRef<"input">;

function PlainInput(props: PlainInputProps) {
  return <input {...props} />;
}

const Input = styled.input`
  padding: ${(props) => props.theme.inputPadding};
  padding-left: 0;
  background-color: white;
  border: 1px solid #ccc;
`;

const TokenBorderInput = styled.input`
  border: ${(props) => props.theme.inputBorder};
  border-radius: 4px;
  background-color: white;
`;

const TokenBorderWrappedInput = styled(PlainInput)`
  border: ${(props) => props.theme.inputBorder};
  border-radius: 4px;
  background-color: white;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <Input placeholder="With directional padding" />
    <TokenBorderInput placeholder="With token border" />
    <TokenBorderWrappedInput placeholder="Wrapped token border" />
  </div>
);
