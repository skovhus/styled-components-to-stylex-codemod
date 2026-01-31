import styled from "styled-components";

// Simple renamed destructured prop
const Button = styled.button<{ color?: string }>`
  color: ${({ color: color_ }) => color_ || "hotpink"};
`;

// Shorthand destructured prop
const Link = styled.a<{ fontSize: string }>`
  font-size: ${({ fontSize }) => fontSize};
`;

// Destructured prop with default value
const Card = styled.div<{ padding?: string }>`
  padding: ${({ padding = "16px" }) => padding};
`;

// Renamed destructured prop with default value
const Box = styled.div<{ margin?: string }>`
  margin: ${({ margin: m = "8px" }) => m};
`;

// Multiple destructured props (only one used per interpolation)
const Text = styled.span<{ weight: string; size: string }>`
  font-weight: ${({ weight }) => weight};
  font-size: ${({ size }) => size};
`;

export const App = () => (
  <>
    <Button color="red">Click</Button>
    <Button>Click (default)</Button>
    <Link fontSize="14px" href="#">
      Link
    </Link>
    <Card>Card</Card>
    <Card padding="24px">Card with padding</Card>
    <Box>Box</Box>
    <Box margin="12px">Box with margin</Box>
    <Text weight="bold" size="16px">
      Text
    </Text>
  </>
);
