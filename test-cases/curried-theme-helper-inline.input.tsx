import styled from "styled-components";
import { themedBorder } from "./lib/helpers";

const Box = styled.div<{ position: "top" | "bottom" }>`
  padding: 8px;
  border: ${(props) => (props.position === "top" ? themedBorder("labelMuted")(props) : "none")};
`;

export const App = () => (
  <span>
    <Box position="top">Top box with themed border</Box>
    <Box position="bottom">Bottom box without border</Box>
  </span>
);
