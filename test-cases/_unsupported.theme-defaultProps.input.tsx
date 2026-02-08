// @expected-warning: Theme prop overrides on styled components are not supported
import styled from "styled-components";
import { testCaseTheme } from "./tokens.stylex";

const Button = styled.button`
  padding: 8px 16px;
  background-color: ${(props) => props.theme.color.bgBase};
  color: white;
  border-width: 2px;
  border-style: solid;
  border-color: ${(props) => props.theme.color.bgBorderFaint};
`;

Button.defaultProps = {
  theme: testCaseTheme,
};

export const App = () => (
  <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
    <Button>Default Props Theme</Button>
  </div>
);
