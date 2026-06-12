// A later equivalent base rule wins, making the earlier runtime branch dead code.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  position: relative;
  top: ${Browser.isTouchDevice ? 5 : 1}px;
  & {
    top: 2px;
  }
  background-color: peachpuff;
`;

export const App = () => <Box>Later base rule wins</Box>;
