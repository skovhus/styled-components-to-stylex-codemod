// @expected-warning: Unsupported interpolation: call expression
// Unlike margin/padding (which StyleX's compiler expands internally), the
// scroll-margin/scroll-padding shorthands are not valid StyleX keys and must be
// written as physical longhands. A single interpolated value cannot be expanded
// to those longhands here, so the codemod bails.
import styled from "styled-components";
import { PageSizeConstants } from "./lib/pageSizes.stylex";

const Box = styled.div`
  scroll-padding: ${PageSizeConstants.listInitiativeRowHeight}px;
  background-color: peachpuff;
`;

export const App = () => <Box>Scroll shorthand unit</Box>;
