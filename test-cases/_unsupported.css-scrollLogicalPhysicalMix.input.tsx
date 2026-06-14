// @expected-warning: Mixed logical and physical scroll properties cannot be normalized without a known writing-mode
// A logical scroll longhand (scroll-padding-inline-start) and the physical side
// it maps to (scroll-padding-left) cannot coexist: StyleX's logical/physical
// conflict normalization resolves them to physical sides assuming horizontal-tb,
// silently dropping the logical value's RTL/vertical behavior — bail.
import styled from "styled-components";

const Box = styled.div<{ $active?: boolean }>`
  scroll-padding-inline-start: 2px;
  scroll-padding-left: ${(props) => (props.$active ? "4px" : "6px")};
  background-color: lavender;
`;

export const App = () => <Box>Scroll logical/physical mix</Box>;
