// @expected-warning: Unsupported selector: compound pseudo selector
// Local JSX aliases can pass as to a styled button and render it as a non-form target.
import styled from "styled-components";

const Button = styled.button`
  padding: 8px 12px;
  background-color: white;

  &:enabled:hover {
    background-color: #dbeafe;
  }
`;

export const App = () => {
  const LinkButton = Button;

  return (
    <div style={{ display: "flex", gap: 12, padding: 16 }}>
      <Button type="button">Button</Button>
      <LinkButton as="a" href="#">
        Link
      </LinkButton>
    </div>
  );
};
