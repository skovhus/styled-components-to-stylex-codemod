// @expected-warning: Unsupported .attrs() object value
// A top-level spread in an object-form `.attrs({ ...defaults })` pulls in props the
// codemod cannot enumerate. It must bail rather than silently erasing every spread prop.
import styled from "styled-components";

const defaults = { role: "button", tabIndex: 0 };

const Box = styled.div.attrs({ ...defaults })`
  color: red;
`;

export const App = () => <Box>Top-level spread attrs</Box>;
