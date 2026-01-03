// expected-warnings: createGlobalStyle
import { createGlobalStyle } from "styled-components";

const GlobalStyle = createGlobalStyle`
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  a {
    color: #BF4F74;
    text-decoration: none;
  }
`;

export const App = () => (
  <>
    <GlobalStyle />
    <div>Hello World</div>
  </>
);
