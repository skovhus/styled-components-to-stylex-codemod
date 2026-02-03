import styled, { css } from "styled-components";

const BaseStyles = css`
  color: red;
`;

const MiddleStyles = css`
  ${BaseStyles}
  background: blue;
`;

const FinalComponent = styled.div`
  ${MiddleStyles}
  padding: 10px;
`;

export const App = () => <FinalComponent>Recursive mixins</FinalComponent>;
