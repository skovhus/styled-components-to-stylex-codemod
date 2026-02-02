import styled from "styled-components";

const HiddenOnMobile = styled.div`
  @media (max-width: 767px) {
    display: none;
  }
`;

const ElementWithMixin = styled.div`
  color: red;
  ${HiddenOnMobile}
`;

export const App = () => <ElementWithMixin>Red with mixin</ElementWithMixin>;
