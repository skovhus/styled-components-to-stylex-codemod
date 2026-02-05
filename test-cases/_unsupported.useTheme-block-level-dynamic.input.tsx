// @expected-warning: Theme-dependent block-level conditional could not be fully resolved (branches may contain dynamic interpolations)
import styled from "styled-components";

// Unsupported: block-level theme conditional where a branch contains a dynamic
// interpolation (props.someDynamic) that cannot be statically resolved.

const Box = styled.div`
  ${(props) => (props.theme.isDark ? `color: ${props.someDynamic};` : "color: black;")}
`;

export const App = () => <Box />;
