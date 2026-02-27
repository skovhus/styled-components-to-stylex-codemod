// styled(Flex) with mixin mode — base flex styles from imported mixin, additional props in stylex.create
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Button = styled(Flex).attrs({ column: true, gap: 16 })`
  padding: 8px 16px;
  background-color: cornflowerblue;
  color: white;
  border-radius: 4px;
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: "12px" }}>
      <Button>Column Button</Button>
    </div>
  );
}
