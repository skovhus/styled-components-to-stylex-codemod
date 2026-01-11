// @flow
// Flow test case - verifies no TypeScript types are emitted
import styled from "styled-components";

export const Button = styled.button`
  background: #bf4f74;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`;

const Card = styled.div`
  padding: 16px;
  background: white;
  border-radius: 8px;
`;

export const App = () => (
  <div>
    <Button>Click me</Button>
    <Card>Card content</Card>
  </div>
);
