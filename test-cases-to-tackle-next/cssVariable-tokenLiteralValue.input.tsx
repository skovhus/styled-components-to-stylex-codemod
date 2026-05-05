// CSS variable tokens used for literal-union properties must emit assignable literal values.
import styled from "styled-components";

const ClickTarget = styled.button`
  cursor: var(--pointer);
  padding: 8px 12px;
  background: #dbeafe;
  border: 0;
`;

export const App = () => <ClickTarget>Click target</ClickTarget>;
