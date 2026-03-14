import styled, { css } from "styled-components";

const HiddenOnMobile = css`
  @media (max-width: 767px) {
    display: none;
  }
`;

const ElementWithMixin = styled.div`
  color: red;
  ${HiddenOnMobile}
`;

// Multiple mixins interpolated in a single styled component
const ColorMixin = css`
  color: red;
`;

const BackgroundMixin = css`
  background: blue;
`;

const MultiMixinContainer = styled.div`
  ${ColorMixin}
  ${BackgroundMixin}
  padding: 10px;
`;

export const App = () => (
  <div>
    <ElementWithMixin>Red with mixin</ElementWithMixin>
    <MultiMixinContainer>Multiple mixins</MultiMixinContainer>
  </div>
);
