// @expected-warning: Unsupported selector: pseudo-class on pseudo-element selector
// Dynamic pseudo-element style inside :hover context is not representable by StyleX.
import styled from "styled-components";

const Button = styled.button<{ $glowColor: string }>`
  position: relative;
  padding: 8px 16px;
  background-color: #333;
  color: white;

  &::after {
    content: "";
    display: block;
    height: 3px;
    opacity: 0;
  }

  &:hover::after {
    opacity: 1;
    background-color: ${(props) => props.$glowColor};
  }
`;

export const App = () => <Button $glowColor="rgba(0,128,255,0.3)">Hover me</Button>;
