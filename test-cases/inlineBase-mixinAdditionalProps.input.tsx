// Resolver mixin base styles with extra Flex props in local styles
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Button = styled(Flex).attrs({
  direction: "row",
  align: "center",
  gap: 12,
})`
  padding: 8px 12px;
  background-color: #ecf2ff;
  border: 1px solid #6b7ca8;
  color: #1f2b43;
`;

export function App() {
  return <Button>Mixin + props</Button>;
}
