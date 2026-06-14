// A numeric stylex const with a unit suffix inside a directional shorthand is a
// single proven token, so it can be emitted directly without expansion.
import styled from "styled-components";
import { PageSizeConstants } from "./lib/pageSizes.stylex";

const Box = styled.div`
  margin: ${PageSizeConstants.listInitiativeRowHeight}px;
  background-color: peachpuff;
`;

const PaddedBox = styled.div`
  padding: ${PageSizeConstants.listInitiativeRowHeight}px;
  background-color: lavender;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <Box>Imported shorthand unit</Box>
    <PaddedBox>Padded shorthand unit</PaddedBox>
  </div>
);
