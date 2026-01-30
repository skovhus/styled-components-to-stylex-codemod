import styled from "styled-components";

// Direct template literal body with string props (values used directly in CSS)
const Box = styled.div<{ $width: string; $height: string }>`
  ${(props) =>
    `
    width: ${props.$width};
    height: ${props.$height};
  `}
`;

// Mixed static and dynamic styles
const MixedBox = styled.div<{ $padding: string }>`
  background-color: blue;
  ${(props) => `padding: ${props.$padding};`}
`;

// Multiple dynamic properties in a single template literal
const MultiPropBox = styled.div<{ $margin: string; $border: string }>`
  ${(props) => `margin: ${props.$margin}; border: ${props.$border};`}
`;

export const App = () => (
  <div>
    <Box $width="100px" $height="50px" />
    <MixedBox $padding="10px" />
    <MultiPropBox $margin="8px" $border="1px solid red" />
  </div>
);
