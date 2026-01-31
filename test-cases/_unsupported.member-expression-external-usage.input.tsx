// @expected-warning: Unsupported interpolation: member expression
// CSS helper object members used outside styled templates should bail
import styled, { css } from "styled-components";

const buttonStyles = {
  rootCss: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
  `,
  sizeCss: css`
    padding: 8px 16px;
    font-size: 14px;
  `,
};

// This usage inside a styled template is OK
const Button = styled.button`
  ${buttonStyles.rootCss}
  background-color: #bf4f74;
`;

// But this external usage should cause us to bail (not transform)
// because removing the CSS properties would break this code
const exportedStyles = [buttonStyles.sizeCss];

export const App = () => <Button>Click me</Button>;
export { exportedStyles };
