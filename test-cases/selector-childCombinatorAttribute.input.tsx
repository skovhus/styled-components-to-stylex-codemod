// Child combinator with attribute selector: `& > button[disabled]`
// Maps [disabled] to :disabled pseudo-class on the child styled component.
import styled from "styled-components";

const ActionButton = styled.button`
  padding: 8px 16px;
  background: #bf4f74;
  color: white;
  border: none;
  border-radius: 4px;
`;

const Trigger = styled.div`
  display: flex;
  gap: 8px;
  padding: 16px;
  background: #f0f0f0;

  & > button[disabled] {
    pointer-events: none;
    opacity: 0.5;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Trigger>
      <ActionButton>Enabled</ActionButton>
      <ActionButton disabled>Disabled</ActionButton>
    </Trigger>
  </div>
);
