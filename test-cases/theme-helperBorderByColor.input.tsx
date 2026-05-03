import styled from "styled-components";
import { borderByColor } from "./lib/helpers";

const Box = styled.div`
  padding: 12px;
  border-bottom: ${(p) => borderByColor(p.theme.color.bgSub)};
`;

export const App = () => <Box>Themed helper border</Box>;
