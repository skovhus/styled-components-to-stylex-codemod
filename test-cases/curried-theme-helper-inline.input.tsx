import styled from "styled-components";
import { borderByColor, themedBorder } from "./lib/helpers";

const Box = styled.div`
  padding: 8px;
  border-bottom: ${(p) => borderByColor(p.theme.color.bgSub)};
`;

const BorderedBox = styled.div`
  border: ${themedBorder("labelMuted")};
`;

export const App = () => (
  <div style={{ margin: "10px", padding: "10px", height: "100px" }}>
    <Box>Box with themed border</Box>
    <BorderedBox>Bordered box</BorderedBox>
  </div>
);
