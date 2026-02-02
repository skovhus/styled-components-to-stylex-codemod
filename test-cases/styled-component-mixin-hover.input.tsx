import styled from "styled-components";

const HoverStyles = styled.div`
  &:hover {
    color: blue;
  }
`;

const Button = styled.button`
  color: red;
  ${HoverStyles}
`;

export const App = () => <Button>Hover me</Button>;
