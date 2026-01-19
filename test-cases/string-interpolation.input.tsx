// oxlint-disable no-unused-vars
import styled from "styled-components";

// String interpolation for dynamic values
const dynamicColor = "#BF4F74";
const spacing = 16;
const borderRadius = "4px";

const Button = styled.button`
  background: ${dynamicColor};
  padding: ${spacing}px;
  border-radius: ${borderRadius};
  color: white;
  border: none;
`;

// Template literal with expressions
const fontSize = 14;
const lineHeight = 1.5;

const Text = styled.p`
  font-size: ${fontSize}px;
  line-height: ${lineHeight};
  margin: ${spacing / 2}px 0;
`;

// Conditional string interpolation
const isPrimary = true;
const ConditionalButton = styled.button`
  background: ${isPrimary ? "#BF4F74" : "#ccc"};
  color: ${isPrimary ? "white" : "#333"};
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`;

// Array/object property interpolation
const theme = {
  colors: {
    primary: "#BF4F74",
    secondary: "#4F74BF",
  },
  spacing: {
    sm: "8px",
    md: "16px",
  },
};

const ThemedCard = styled.div`
  background: ${theme.color.primary};
  border: 1px solid ${theme.color.secondary};
  padding: ${theme.spacing.md};
  border-radius: 8px;
`;

// Function returning string
const getColor = (variant: string) => (variant === "primary" ? "#BF4F74" : "#4F74BF");

const DynamicBox = styled.div<{ $variant: string }>`
  background: ${(props) => getColor(props.$variant)};
  padding: 16px;
  color: white;
  border-radius: 4px;
`;

export const App = () => (
  <div>
    <Button>Button</Button>
    <Text>Some text</Text>
    <ConditionalButton>Conditional</ConditionalButton>
    <ThemedCard>Themed Card</ThemedCard>
    <DynamicBox $variant="primary">Primary</DynamicBox>
    <DynamicBox $variant="secondary">Secondary</DynamicBox>
  </div>
);
