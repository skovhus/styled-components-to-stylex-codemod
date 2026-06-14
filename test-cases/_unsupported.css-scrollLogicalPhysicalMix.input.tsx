// @expected-warning: Mixed logical and physical scroll properties cannot be normalized without a known writing-mode
// A logical scroll longhand (scroll-padding-inline-start) and a physical scroll
// side in the same family (scroll-padding-right) cannot coexist: the
// logical-to-physical mapping depends on writing-mode/direction (inline-start is
// the right side in RTL), so StyleX's horizontal-tb LTR normalization may
// preserve or override the wrong side — bail on any such mix.
import styled from "styled-components";

const Box = styled.div<{ $active?: boolean }>`
  scroll-padding-inline-start: 2px;
  scroll-padding-right: ${(props) => (props.$active ? "4px" : "6px")};
  background-color: lavender;
`;

export const App = () => <Box>Scroll logical/physical mix</Box>;
