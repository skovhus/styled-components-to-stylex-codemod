// @expected-warning: Heterogeneous background values (mix of gradients and colors) not currently supported
import styled from "styled-components";

// This pattern mixes gradients (which need backgroundImage) and colors
// (which need backgroundColor) in the same conditional, making it
// impossible to safely transform to StyleX.
const MixedBackground = styled.div<{ $useGradient: boolean }>`
  background: ${(props) => (props.$useGradient ? "linear-gradient(90deg, red, blue)" : "green")};
`;

export { MixedBackground };
