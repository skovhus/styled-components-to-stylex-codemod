// Keeps non-consumed attrs while inlining consumed Flex attrs
import styled from "styled-components";
import { Flex } from "@linear/orbiter/components/Flex";

const Container = styled(Flex).attrs({
  column: true,
  role: "region",
  "data-testid": "mixed-inline-base",
})`
  padding: 8px;
  background-color: #fff4e6;
  border: 1px solid #b97;
`;

export function App() {
  return <Container id="mixed-box">Mixed attrs</Container>;
}
