import styled from "styled-components";

// Simple renamed destructured prop
const Button = styled.button<{ color: string }>`
  color: ${({ color: color_ }) => color_};
`;

export const App = () => <Button color="red">Click</Button>;
