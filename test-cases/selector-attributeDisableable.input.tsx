// Attribute selector [disabled] on non-input form elements (button, select, textarea)
import styled from "styled-components";

const Button = styled.button`
  padding: 8px 16px;
  background-color: #bf4f74;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;

  &[disabled] {
    background-color: #ccc;
    color: #666;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;

  &[disabled] {
    background-color: #f5f5f5;
    color: #999;
  }
`;

const Textarea = styled.textarea`
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;

  &[disabled] {
    background-color: #f5f5f5;
    color: #999;
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
    <Button>Enabled</Button>
    <Button disabled>Disabled</Button>
    <Select>
      <option>Enabled</option>
    </Select>
    <Select disabled>
      <option>Disabled</option>
    </Select>
    <Textarea defaultValue="Enabled" />
    <Textarea disabled defaultValue="Disabled" />
  </div>
);
