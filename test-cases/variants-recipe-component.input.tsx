import * as React from "react";
import styled from "styled-components";

// Test case for component wrappers with namespace variant dimensions
// (boolean prop overlapping with enum prop on the same CSS properties)

type BaseButtonProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}>;

function BaseButton(props: BaseButtonProps) {
  const { disabled, ...rest } = props;
  return <button disabled={disabled} {...rest} />;
}

type ButtonProps = {
  color?: "primary" | "secondary";
  disabled?: boolean;
};

const Button = styled(BaseButton)<ButtonProps>`
  appearance: none;
  border-width: 0;
  color: white;

  background-color: ${(props) => (props.color === "primary" ? "blue" : "gray")};

  &:hover {
    background-color: ${(props) => (props.color === "primary" ? "darkblue" : "darkgray")};
  }

  ${(props) =>
    props.disabled && "background-color: grey; color: rgb(204, 204, 204); cursor: not-allowed;"}
`;

export function App() {
  return (
    <div>
      <Button color="primary">Primary</Button>
      <Button color="secondary">Secondary</Button>
      <Button color="primary" disabled>
        Disabled Primary
      </Button>
    </div>
  );
}
