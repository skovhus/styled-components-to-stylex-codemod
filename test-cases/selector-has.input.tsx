// &:has(${Component}) — style self when containing a specific descendant
import styled from "styled-components";

const Icon = styled.span`
  color: blue;
  font-size: 20px;
`;

const Button = styled.button`
  padding: 8px 16px;
  background: lightgray;

  &:has(${Icon}) {
    padding-right: 32px;
    background: lightyellow;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Button>No icon</Button>
    <Button>
      With icon <Icon>★</Icon>
    </Button>
  </div>
);
