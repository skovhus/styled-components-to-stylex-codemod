import styled, { css } from "styled-components";

// Base css mixins that will be shared
const hiddenOnMobileMixin = css`
  @media (max-width: 767px) {
    display: none;
  }
`;

const colorMixin = css`
  color: red;
`;

const HiddenOnMobile = styled.div`
  ${hiddenOnMobileMixin}
`;

// Using shared mixins within components
const ElementWithMixin = styled.div`
  color: red;
  padding: 16px;
  ${hiddenOnMobileMixin}
`;

const ElementWithMixinHover = styled.div`
  ${colorMixin}
  &:hover {
    color: blue;
  }
`;

const AnotherMixedElement = styled.div`
  background-color: blue;
  ${hiddenOnMobileMixin}
  font-weight: bold;
`;

export const App = () => (
  <div>
    <HiddenOnMobile>Hidden on mobile (base)</HiddenOnMobile>
    <ElementWithMixin>Red with mixin</ElementWithMixin>
    <ElementWithMixinHover>Red default, blue hover mixin</ElementWithMixinHover>
    <AnotherMixedElement>Blue with mixin</AnotherMixedElement>
  </div>
);
