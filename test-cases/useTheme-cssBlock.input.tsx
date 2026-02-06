import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

const Box = styled.div`
  ${(props) => (props.theme.isDark ? "" : `padding: ${thinPixel()};`)}
`;

export const App = () => <Box />;
