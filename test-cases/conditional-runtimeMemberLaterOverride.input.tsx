// A later longhand declaration wins over the earlier runtime shorthand branch for that side.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  margin: ${Browser.isTouchDevice ? 4 : 8}px 12px;
  margin-top: 0;
  background-color: peachpuff;
`;

export const App = () => <Box>Later margin-top wins</Box>;
