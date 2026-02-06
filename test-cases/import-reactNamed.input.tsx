import styled from "styled-components";
import { useCallback, useEffect } from "react";

// This component has a named React import but no default/namespace import
// When transformed, if it needs React (e.g., React.PropsWithChildren),
// it should add React to the existing import, not create a duplicate
const Card = styled.div`
  padding: 16px;
  background: white;
`;

interface ButtonProps {
  variant: "primary" | "secondary";
}

// This styled component has props which will generate React.PropsWithChildren
const Button = styled.button<ButtonProps>`
  padding: 8px 16px;
  background: ${(props) => (props.variant === "primary" ? "blue" : "gray")};
  color: white;
`;

export const App = () => {
  const handleClick = useCallback(() => {
    console.log("clicked");
  }, []);

  useEffect(() => {
    console.log("mounted");
  }, []);

  return (
    <Card onClick={handleClick}>
      <Button variant="primary">Click me</Button>
    </Card>
  );
};
