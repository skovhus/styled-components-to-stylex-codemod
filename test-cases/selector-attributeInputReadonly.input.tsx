// Input with readonly attribute selector triggers injectExtraInputProps path
import styled from "styled-components";

export const TextInput = styled.input`
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  background-color: white;

  &:focus {
    border-color: #bf4f74;
    outline: none;
  }

  &[readonly] {
    background-color: #f5f5f5;
    border-style: dashed;
    cursor: default;
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
      <TextInput type="text" placeholder="Editable" />
      <TextInput type="text" readOnly value="Read only field" />
    </div>
  );
}
