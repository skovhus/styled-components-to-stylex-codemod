import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

// Block-level theme boolean conditional: theme.isDark controls entire CSS block
const Box = styled.div`
  height: 100px;
  width: 100px;
  ${(props) => (props.theme.isDark ? `padding: ${thinPixel()};` : `padding: 100px;`)}
`;

// Block-level theme binary conditional: theme.mode === "dark" controls entire CSS block
const ModeBox = styled.div`
  height: 100px;
  width: 100px;
  ${(props) => (props.theme.mode === "dark" ? "color: white;" : "color: black;")}
`;

export const App = () => (
  <div>
    <Box>Theme prop</Box>
    <ModeBox>Theme mode</ModeBox>
  </div>
);
