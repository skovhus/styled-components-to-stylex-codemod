import styled from "styled-components";

// Base styled component that will be used as a mixin
const HiddenOnMobile = styled.div`
  @media (max-width: 767px) {
    display: none;
  }
`;

// Using another styled component's styles as a mixin
const ElementWithMixin = styled.div`
  color: red;
  padding: 16px;
  ${HiddenOnMobile}
`;

const AnotherMixedElement = styled.div`
  background-color: blue;
  ${HiddenOnMobile}
  font-weight: bold;
`;

export const App = () => (
  <div>
    <HiddenOnMobile>Hidden on mobile (base)</HiddenOnMobile>
    <ElementWithMixin>Red with mixin</ElementWithMixin>
    <AnotherMixedElement>Blue with mixin</AnotherMixedElement>
  </div>
);
