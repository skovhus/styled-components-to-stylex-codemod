import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

// Block-level theme boolean conditional: theme.isDark controls entire CSS block
const Box = styled.div`
  height: 100px;
  width: 100px;
  ${(props) => (props.theme.isDark ? `padding: ${thinPixel()};` : `padding: 100px;`)}
`;

export const App = () => <Box />;
