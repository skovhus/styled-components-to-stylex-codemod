import styled from "styled-components";
import isPropValid from "@emotion/is-prop-valid";

// Using shouldForwardProp to filter props (v5 pattern)
const Button = styled.button.withConfig({
  shouldForwardProp: (prop) => !["color", "size"].includes(prop),
})<{ color?: string; size?: "small" | "large" }>`
  background: ${(props) => props.color || "#BF4F74"};
  padding: ${(props) => (props.size === "large" ? "12px 24px" : "8px 16px")};
  font-size: ${(props) => (props.size === "large" ? "18px" : "14px")};
  color: white;
  border: none;
  border-radius: 4px;
`;

// Using isPropValid from @emotion
const Link = styled.a.withConfig({
  shouldForwardProp: (prop) => isPropValid(prop) && prop !== "isActive",
})<{ isActive?: boolean }>`
  color: ${(props) => (props.isActive ? "#BF4F74" : "#333")};
  font-weight: ${(props) => (props.isActive ? "bold" : "normal")};
  text-decoration: none;

  &:hover {
    color: #bf4f74;
  }
`;

// Custom prop filtering logic (transient props pattern)
const Box = styled.div.withConfig({
  shouldForwardProp: (prop) => !prop.startsWith("$"),
})<{ $background?: string; $padding?: string }>`
  background: ${(props) => props.$background || "white"};
  padding: ${(props) => props.$padding || "16px"};
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

// Filter multiple custom props
const Card = styled.div.withConfig({
  shouldForwardProp: (prop) => !["variant", "elevation", "rounded"].includes(prop),
})<{
  variant?: "primary" | "secondary";
  elevation?: number;
  rounded?: boolean;
}>`
  background: ${(props) => (props.variant === "primary" ? "#BF4F74" : "#4F74BF")};
  box-shadow: ${(props) =>
    `0 ${(props.elevation || 1) * 2}px ${(props.elevation || 1) * 4}px rgba(0, 0, 0, 0.1)`};
  border-radius: ${(props) => (props.rounded ? "16px" : "4px")};
  padding: 16px;
  color: white;
`;

export const App = () => (
  <div>
    <Button color="#4CAF50" size="large">
      Large Green Button
    </Button>
    <Button>Default Button</Button>
    <br />
    <Link href="#" isActive>
      Active Link
    </Link>
    <Link href="#">Normal Link</Link>
    <br />
    <Box $background="#f0f0f0" $padding="24px">
      Box with transient-like props
    </Box>
    <Card variant="primary" elevation={3} rounded>
      Elevated Card
    </Card>
  </div>
);
