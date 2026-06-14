// @expected-warning: Imported runtime condition root collides with a component prop of the same name
// The imported runtime condition root `browser` (from `Browser as browser`)
// shares its name with a component prop `browser` (inferred here from
// `props.browser`, with no explicit generic). Wrapper emission marks `browser`
// as non-prop for the whole component, which would make the prop-based color
// variant read the imported module object instead of the prop — bail.
import styled from "styled-components";
import { Browser as browser } from "./lib/helpers";

const Box = styled.div`
  position: relative;
  top: ${browser.isTouchDevice ? 5 : 1}px;
  color: ${(props) => (props.browser ? "red" : "blue")};
`;

export const App = () => (
  <div>
    <Box browser>Collision</Box>
    <Box>No collision</Box>
  </div>
);
