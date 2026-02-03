import styled, { css } from "styled-components";

const HoverStyles = css`
  &:hover {
    color: blue;
  }
`;

const Button = styled.button`
  color: red;
  ${HoverStyles}
`;

export const App = () => <Button>Hover me</Button>;
