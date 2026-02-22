import styled from "styled-components";

const Icon = styled.svg`
  width: 16px;
  height: 16px;
`;

const Button = styled.button`
  display: flex;

  ${Icon} {
    fill: currentColor;
  }
`;

export const App = () => (
  <Button>
    <Icon />
  </Button>
);
