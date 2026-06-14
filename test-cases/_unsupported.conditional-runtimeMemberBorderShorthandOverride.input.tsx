// @expected-warning: Unsupported interpolation: call expression
// A later `border-top` shorthand resets the style/color it omits, but only its
// explicit `border-top-width` longhand is visible to the subtraction. Removing
// just the width would leave the runtime branch's borderStyle/borderColor in
// place and draw a border the cascade reset away — bail.
import styled from "styled-components";
import { Browser } from "./lib/helpers";

const Box = styled.div`
  border: ${Browser.isTouchDevice ? 2 : 1}px solid red;
  border-top: 1px;
  background-color: peachpuff;
`;

export const App = () => <Box>Border shorthand override</Box>;
