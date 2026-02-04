// @expected-warning: Theme-dependent conditional values require a project-specific theme source (e.g. useTheme())
import styled from "styled-components";

// Unsupported: props.theme.isDark && props.enabled is a theme-dependent conditional
// that cannot be converted to StyleX.
const Box = styled.div`
  ${(props) => (props.theme.isDark && props.enabled ? "opacity: 0.5;" : "")}
`;

export const App = () => <Box />;
