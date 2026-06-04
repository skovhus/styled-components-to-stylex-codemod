// @expected-warning: Adapter resolveValue returned undefined for imported value
// Runtime imported branches are unsafe under ancestor attribute selectors.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  [data-active] & {
    top: ${Browser.isTouchDevice ? 5 : 1}px;
  }
`;

export const App = () => (
  <div data-active>
    <Box>Ancestor attribute runtime branch</Box>
  </div>
);
