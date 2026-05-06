import styled from "styled-components";

// This pattern mixes gradients (which need backgroundImage) and colors
// (which need backgroundColor) in the same conditional. Each variant
// is emitted with its appropriate StyleX property.
const MixedBackground = styled.div<{ $useGradient: boolean }>`
  background: ${(props) => (props.$useGradient ? "linear-gradient(90deg, red, blue)" : "green")};
`;

// Nested ternary with all colors (homogeneous) but using || in the default condition
// Tests that "!(A || B)" condition parsing produces valid identifier suffixes
const NestedColorBackground = styled.div<{ $color: "red" | "blue" | "default" }>`
  background: ${(props) =>
    props.$color === "red" ? "crimson" : props.$color === "blue" ? "navy" : "gray"};
`;

// Pattern 3: background: none should expand to longhands, not backgroundColor: "none"
// "none" is a valid CSS value for `background` shorthand and background-image
// but is NOT a valid value for `background-color` (which only accepts <color> values)
const ResetBackground = styled.div`
  background: none;
  padding: 8px;
`;

// Pattern 4: background: none in pseudo selectors should reset the image and color longhands.
const ResetBackgroundOnHover = styled.button`
  background: pink;
  padding: 8px;

  &:hover {
    background: none;
  }
`;

export const App = () => (
  <div>
    <MixedBackground $useGradient={false}>Solid Color</MixedBackground>
    <MixedBackground $useGradient={true}>Gradient</MixedBackground>
    <NestedColorBackground $color="red">Red</NestedColorBackground>
    <NestedColorBackground $color="blue">Blue</NestedColorBackground>
    <NestedColorBackground $color="default">Default</NestedColorBackground>
    <ResetBackground>No Background</ResetBackground>
    <ResetBackgroundOnHover>Hover Reset</ResetBackgroundOnHover>
  </div>
);
