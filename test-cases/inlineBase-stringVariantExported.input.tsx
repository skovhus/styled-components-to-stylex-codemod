// Exported component with string variant prop must use keyed lookup, not truthy guard
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

export const Card = styled(Flex)`
  padding: 12px;
  background-color: #ffffff;
  border: 1px solid #ddd;
`;

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Card>Default row</Card>
      <Card direction="column">Column card</Card>
    </div>
  );
}
