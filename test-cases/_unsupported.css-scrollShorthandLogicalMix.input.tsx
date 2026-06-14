// @expected-warning: Mixed logical and physical scroll properties cannot be normalized without a known writing-mode
// The full `scroll-padding` shorthand expands to physical Top/Right/Bottom/Left
// longhands, so combined with a logical scroll longhand (scroll-padding-inline-start)
// it is the same writing-mode-ambiguous logical/physical mix — bail.
import styled from "styled-components";

const Box = styled.div`
  scroll-padding: 1px;
  scroll-padding-inline-start: 2px;
  background-color: lavender;
`;

export const App = () => <Box>Scroll shorthand + logical mix</Box>;
