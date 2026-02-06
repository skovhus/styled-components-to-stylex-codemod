import styled, { css } from "styled-components";
import { color } from "./lib/helpers";

export function getPrimaryStyles() {
  return css`
    background-color: ${color("primaryColor")};
    color: ${color("labelMuted")};
  `;
}

const Button = styled.button`
  padding: 8px 16px;
  border-radius: 4px;
  ${getPrimaryStyles()}
`;

export const App = () => <Button>Click me</Button>;
