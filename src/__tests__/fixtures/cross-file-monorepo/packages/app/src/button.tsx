import styled from "styled-components";
import { CollapseArrowIcon } from "@myorg/icons";

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;

  ${CollapseArrowIcon} {
    width: 18px;
    height: auto;
  }

  &:hover ${CollapseArrowIcon} {
    transform: rotate(180deg);
  }
`;

export const App = () => (
  <Button>
    <CollapseArrowIcon />
    Toggle
  </Button>
);
