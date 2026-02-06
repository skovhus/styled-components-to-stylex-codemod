import styled from "styled-components";

// Destructured prop with default AND || fallback
// When color is undefined, should use "hotpink" (default)
// When color is falsy but defined (e.g., ""), should use "blue" (|| fallback)
const Button = styled.button<{ color?: string }>`
  color: ${({ color = "hotpink" }) => color || "blue"};
`;

// Destructured prop with ternary using default
// When size is undefined, should use 16 (default), then check if it equals 16
const Card = styled.div<{ size?: number }>`
  padding: ${({ size = 16 }) => (size === 16 ? "1rem" : `${size}px`)};
`;

// Renamed destructured prop with default AND fallback
const Box = styled.div<{ margin?: number }>`
  margin: ${({ margin: m = 10 }) => m || 5}px;
`;

export const App = () => (
  <>
    <Button>Default (should be hotpink)</Button>
    <Button color="">Empty string (should be blue)</Button>
    <Button color="red">Red</Button>
    <Card>Default size (should be 1rem)</Card>
    <Card size={16}>Size 16 (should be 1rem)</Card>
    <Card size={24}>Size 24 (should be 24px)</Card>
    <Box>Default (should be 10px)</Box>
    <Box margin={0}>Zero (should be 5px)</Box>
    <Box margin={20}>20px</Box>
  </>
);
