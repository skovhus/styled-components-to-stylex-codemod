import styled from "styled-components";
import { borderByColor } from "./lib/helpers";

const Box = styled.div`
  border-bottom: ${({ theme }) => borderByColor(theme.color.bgSub)};
  padding: 8px 16px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Box>Box with border</Box>
  </div>
);
