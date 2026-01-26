// Member expressions referencing CSS template literals can be interpolated
import styled, { css } from "styled-components";

const buttonStyles = {
  rootCss: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
  `,
  sizeCss: css`
    padding: 8px 16px;
    font-size: 14px;
  `,
};

const Button = styled.button`
  ${buttonStyles.rootCss}
  ${buttonStyles.sizeCss}
  background-color: #bf4f74;
  color: white;
  border-radius: 4px;
`;

export const App = () => <Button>Click me</Button>;
