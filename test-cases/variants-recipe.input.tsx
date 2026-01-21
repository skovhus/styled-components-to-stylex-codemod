import React from "react";
import styled from "styled-components";

// Styled-components version of the StyleX "variants" recipe:
// https://stylexjs.com/docs/learn/recipes/variants

type Props = {
  color?: "primary" | "secondary";
  size?: "small" | "medium";
  disabled?: boolean;
};

const Button = styled.button<Props>`
  appearance: none;
  border-width: 0;

  background-color: ${(props) => (props.color === "primary" ? "blue" : "gray")};
  color: white;

  &:hover {
    background-color: ${(props) => (props.color === "primary" ? "darkblue" : "darkgray")};
  }

  font-size: ${(props) => (props.size === "medium" ? "1.2rem" : "1rem")};
  padding: ${(props) => (props.size === "medium" ? "8px 16px" : "4px 8px")};

  ${(props) =>
    props.disabled && "background-color: grey; color: rgb(204, 204, 204); cursor: not-allowed;"}
`;

// Second component with same "color" prop but different styles
// This tests that conflicting variant names get per-component prefixes
type LinkProps = {
  color?: "primary" | "secondary";
  disabled?: boolean;
};

const Link = styled.a<LinkProps>`
  text-decoration: none;
  color: ${(props) => (props.color === "primary" ? "red" : "green")};

  &:hover {
    text-decoration: underline;
    color: ${(props) => (props.color === "primary" ? "darkred" : "darkgreen")};
  }

  ${(props) => props.disabled && "color: grey; cursor: not-allowed;"}
`;

export function App() {
  return (
    <div>
      <Button color="primary" size="medium">
        Primary
      </Button>
      <Button color="secondary">Secondary</Button>
      <Button color="primary" size="medium" disabled>
        Disabled
      </Button>
      <Link color="primary" href="#">
        Primary Link
      </Link>
      <Link color="secondary" href="#">
        Secondary Link
      </Link>
    </div>
  );
}
