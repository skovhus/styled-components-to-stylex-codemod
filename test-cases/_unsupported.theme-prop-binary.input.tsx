// @expected-warning: Theme-dependent conditional values require a project-specific theme source (e.g. useTheme())
import styled from "styled-components";

// Unsupported: props.theme.mode === "dark" is a theme-dependent conditional
// that cannot be converted to StyleX.
const Box = styled.div`
  ${(props) => (props.theme.mode === "dark" ? "color: white;" : "color: black;")}
`;

export const App = () => <Box />;
