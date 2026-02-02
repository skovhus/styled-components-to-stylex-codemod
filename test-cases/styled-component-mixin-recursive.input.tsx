import styled from "styled-components";

const BaseStyles = styled.div`
  color: red;
`;

const MiddleStyles = styled.div`
  ${BaseStyles}
  background: blue;
`;

const FinalComponent = styled.div`
  ${MiddleStyles}
  padding: 10px;
`;

export const App = () => <FinalComponent>Recursive mixins</FinalComponent>;
