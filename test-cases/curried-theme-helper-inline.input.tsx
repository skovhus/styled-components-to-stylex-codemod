import styled from "styled-components";
import { borderByColor, themedBorder } from "./lib/helpers";

const Box = styled.div<{ position: "top" | "bottom" }>`
  padding: 8px;
  border: ${(props) => (props.position === "top" ? themedBorder("labelMuted")(props) : "none")};
  border-bottom: ${(p) => borderByColor(p.theme.color.bgSub)};
`;

const BorderedBox = styled.div`
  border: ${themedBorder("labelMuted")};
`;

export const App = () => (
  <div style={{ margin: "10px", padding: "10px", height: "100px" }}>
    <Box position="top">Top box with themed border</Box>
    <Box position="bottom">Bottom box without border</Box>
    <BorderedBox>Bordered box</BorderedBox>
  </div>
);
