import styled from "styled-components";

// Chained pseudo-selectors with :not()
const Input = styled.input`
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;

  &:focus:not(:disabled) {
    border-color: #bf4f74;
    outline: none;
  }

  &:hover:not(:disabled):not(:focus) {
    border-color: #999;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`;

// Checkbox with chained pseudos
const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;

  &:checked:not(:disabled) {
    accent-color: #bf4f74;
  }

  &:focus:not(:disabled) {
    outline: 2px solid #4f74bf;
    outline-offset: 2px;
  }
`;

export const App = () => (
  <div>
    <Input placeholder="Focus me..." />
    <Input disabled placeholder="Disabled" />
    <Checkbox type="checkbox" />
    <Checkbox type="checkbox" disabled />
  </div>
);
