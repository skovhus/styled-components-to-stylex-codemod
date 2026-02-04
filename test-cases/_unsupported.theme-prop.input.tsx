// @expected-warning: Theme-dependent conditional values require a project-specific theme source (e.g. useTheme())
import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

// Unsupported: props.theme.isDark is a theme-dependent conditional value that
// cannot be converted to StyleX. Use a useTheme() hook instead.
const Box = styled.div`
  ${(props) => (props.theme.isDark ? "" : `padding: ${thinPixel()};`)}
`;

export const App = () => <Box />;
