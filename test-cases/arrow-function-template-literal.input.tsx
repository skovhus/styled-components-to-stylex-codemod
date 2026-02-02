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
// Note: dynamic shorthand values should be preserved via inline styles.
const MultiPropBox = styled.div<{
  $margin: string;
  $border: string;
  $padding: string;
  $background: string;
  $scrollMargin: string;
}>`
  ${(props) =>
    `margin: ${props.$margin}; border: ${props.$border}; padding: ${props.$padding}; background: ${props.$background}; scroll-margin: ${props.$scrollMargin};`}
`;

export const App = () => (
  <div>
    <Box $width="100px" $height="50px" />
    <MixedBox $padding="10px" />
    <MultiPropBox
      $margin="8px"
      $border="1px solid red"
      $padding="4px 8px"
      $background="rebeccapurple"
      $scrollMargin="12px"
    />
  </div>
);
