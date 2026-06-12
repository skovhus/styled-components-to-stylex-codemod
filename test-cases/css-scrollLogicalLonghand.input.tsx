// Logical scroll longhands compile losslessly in StyleX, and logical scroll
// shorthands expand to their Start/End longhands. Block-axis scroll-margin is
// covered by _unsupported.css-scrollMarginBlockAxis.
import styled from "styled-components";

const Box = styled.div`
  scroll-margin-inline-start: 6px;
  scroll-margin-inline-end: 4px;
  scroll-padding-block-start: 2px;
  scroll-padding-block-end: 3px;
  scroll-padding-inline: 7px;
  scroll-margin-inline: 5px 9px;
  background-color: lavender;
  padding: 16px;
`;

export const App = () => <Box>Logical scroll longhand</Box>;
