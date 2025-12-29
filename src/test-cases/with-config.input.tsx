import styled from "styled-components";

// withConfig for displayName (debugging)
const Button = styled.button.withConfig({
  displayName: "PrimaryButton",
})`
  background: #BF4F74;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`;

// withConfig for componentId (stable class names)
const Card = styled.div.withConfig({
  displayName: "Card",
  componentId: "sc-card-123",
})`
  padding: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

// Combining withConfig options
const Input = styled.input.withConfig({
  displayName: "StyledInput",
  componentId: "sc-input-456",
  shouldForwardProp: (prop) => prop !== "hasError",
})<{ hasError?: boolean }>`
  padding: 8px 12px;
  border: 2px solid ${(props) => (props.hasError ? "red" : "#ccc")};
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    border-color: ${(props) => (props.hasError ? "red" : "#BF4F74")};
    outline: none;
  }
`;

// withConfig on extended components
const BaseButton = styled.button`
  font-size: 14px;
  cursor: pointer;
`;

const ExtendedButton = styled(BaseButton).withConfig({
  displayName: "ExtendedButton",
})`
  background: #4F74BF;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`;

export const App = () => (
  <div>
    <Button>Primary Button</Button>
    <Card>
      <p>Card content</p>
    </Card>
    <Input placeholder="Normal input" />
    <Input hasError placeholder="Error input" />
    <ExtendedButton>Extended Button</ExtendedButton>
  </div>
);
