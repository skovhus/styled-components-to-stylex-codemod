// Inlines attrs-only base resolution for exported component without local JSX usages
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

export const Container = styled(Flex).attrs({
  column: true,
  gap: 16,
})`
  padding: 4px;
  background-color: #f4f4ff;
`;

export function App() {
  return <div>Exported only</div>;
}
