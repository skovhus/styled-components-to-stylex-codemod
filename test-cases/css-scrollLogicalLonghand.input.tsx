// Logical scroll longhands/shorthands compile losslessly in StyleX (except the
// block-axis scroll-margin longhands, covered by _unsupported.css-scrollMarginBlockAxis).
import styled from "styled-components";

const Box = styled.div`
  scroll-margin-inline-start: 6px;
  scroll-margin-inline-end: 4px;
  scroll-margin-block: 10px 12px;
  scroll-padding-block-start: 2px;
  scroll-padding-block-end: 3px;
  scroll-padding-inline: 7px;
  background-color: lavender;
  padding: 16px;
`;

export const App = () => <Box>Logical scroll longhand</Box>;
