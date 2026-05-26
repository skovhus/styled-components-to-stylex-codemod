import styled from "styled-components";
import { borderByColor } from "./lib/helpers";

const Box = styled.div`
  padding: 12px;
  border-bottom: ${(p) => borderByColor(p.theme.color.bgSub)};
`;

const Separator = styled.div`
  border-top: ${(p) => borderByColor(p.theme.color.bgBorderFaint)};
  margin: 8px 0;
`;

export const App = () => (
  <div>
    <Box>Themed helper border</Box>
    <Separator>Themed helper separator</Separator>
  </div>
);
