// @expected-warning: Unsupported interpolation: call expression
// Imported unit suffixes inside StyleX longhand-only shorthands cannot be emitted directly.
import styled from "styled-components";
import { PageSizeConstants } from "./lib/pageSizes.stylex";

const Box = styled.div`
  margin: ${PageSizeConstants.listInitiativeRowHeight}px;
  background-color: peachpuff;
`;

export const App = () => <Box>Imported shorthand unit</Box>;
