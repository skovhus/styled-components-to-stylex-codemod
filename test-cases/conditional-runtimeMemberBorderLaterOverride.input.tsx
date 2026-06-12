// A later border longhand declaration wins over the earlier runtime border branch for that side.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  border: ${Browser.isTouchDevice ? 1 : 2}px solid red;
  border-top-width: 0;
  background-color: peachpuff;
`;

export const App = () => <Box>Later border-top-width wins</Box>;
