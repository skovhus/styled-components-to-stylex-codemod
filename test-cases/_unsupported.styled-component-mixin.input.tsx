// @expected-warning: Using styled-components components as mixins is not supported; use css`` mixins or strings instead
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
