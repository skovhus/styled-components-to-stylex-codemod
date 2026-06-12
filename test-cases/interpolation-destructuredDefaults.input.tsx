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

// Truthy boolean default in a ternary:
// When $rounded is undefined, the default (true) applies → 12px radius
// Only an explicit false should produce 0 radius
const Pill = styled.span<{ $rounded?: boolean }>`
  padding: 4px 8px;
  background-color: lightseagreen;
  border-radius: ${({ $rounded = true }) => ($rounded ? "12px" : "0")};
`;

// Truthy boolean default gating a conditional block:
// When $framed is undefined, the default (true) applies → border is shown
const Frame = styled.div<{ $framed?: boolean }>`
  padding: 8px;
  ${({ $framed = true }) => $framed && "border: 2px solid darkslategray;"}
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
    <Pill>Default (rounded)</Pill>
    <Pill $rounded={false}>Square</Pill>
    <Pill $rounded>Rounded</Pill>
    <Frame>Default (framed)</Frame>
    <Frame $framed={false}>No frame</Frame>
  </>
);
