// @expected-warning: Imported runtime condition root collides with a component prop of the same name
// The imported runtime condition root `browser` (from `Browser as browser`)
// shares its name with an explicit `browser` component prop. Wrapper emission
// marks `browser` as non-prop for the whole component, which would suppress
// destructuring of the genuine prop in the prop-based variant — bail.
import styled from "styled-components";
import { Browser as browser } from "./lib/helpers";

const Box = styled.div<{ browser?: boolean }>`
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
