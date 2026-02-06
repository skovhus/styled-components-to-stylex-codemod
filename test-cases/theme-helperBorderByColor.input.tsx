import styled from "styled-components";
import { borderByColor } from "./lib/helpers";

const Box = styled.div`
  border-bottom: ${(p) => borderByColor(p.theme.color.bgSub)};
`;

export const App = () => <Box />;
