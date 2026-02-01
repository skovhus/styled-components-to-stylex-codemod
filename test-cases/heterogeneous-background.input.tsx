import styled from "styled-components";

// This pattern mixes gradients (which need backgroundImage) and colors
// (which need backgroundColor) in the same conditional. Each variant
// is emitted with its appropriate StyleX property.
const MixedBackground = styled.div<{ $useGradient: boolean }>`
  background: ${(props) => (props.$useGradient ? "linear-gradient(90deg, red, blue)" : "green")};
`;

export const App = () => (
  <div>
    <MixedBackground $useGradient={false}>Solid Color</MixedBackground>
    <MixedBackground $useGradient={true}>Gradient</MixedBackground>
  </div>
);
