import styled from "styled-components";
import { focusOutline, zIndex } from "./lib/helpers";

const Thing = styled.div`
  border-right: 1px solid hotpink;
  color: blue;

  &:hover {
    color: red;
  }

  &:focus {
    outline: 2px solid blue;
  }

  &::before {
    content: "🔥";
  }

  &::after {
    content: attr(data-label);
  }
`;

const FocusableCell = styled.div<{ $isAnimating?: boolean }>`
  position: relative;
  z-index: ${(props) => (props.$isAnimating ? zIndex.modal : undefined)};

  &:focus-within {
    z-index: ${zIndex.modal + 2};
  }
`;

const LogoButton = styled.button`
  border: 0;
  background-color: transparent;
  padding: 8px;

  &:focus-visible {
    ${focusOutline}
  }
`;

const ResponsiveLogoButton = styled.button`
  border: 0;
  background-color: white;
  padding: 8px;

  @media (prefers-reduced-motion: no-preference) {
    &:focus-visible {
      ${focusOutline}
    }
  }
`;

const MediaLogoButton = styled.button`
  border: 0;
  background-color: #f8fafc;
  padding: 8px;

  @media (hover: hover) {
    ${focusOutline}
  }
`;

const CompactLogoButton = styled.button`
  border: 0;
  background-color: #f1f5f9;
  padding: 8px;
  &:focus-visible { background-color: #dcfce7; ${focusOutline}; }
`;

const CompactMediaLogoButton = styled.button`
  border: 0;
  background-color: #e2e8f0;
  padding: 8px;
  @media (hover: hover) { color: #1d4ed8; ${focusOutline}; }
`;

const OrderedLogoButton = styled.button`
  border: 0;
  background-color: #fff7ed;
  padding: 8px;
  &:focus-visible {
    ${focusOutline};
    outline-color: #dc2626;
  }
`;

const OrderedMediaLogoButton = styled.button`
  border: 0;
  background-color: #ecfdf5;
  padding: 8px;
  @media (hover: hover) {
    ${focusOutline};
    outline-color: #047857;
  }
`;

const NestedLogoButton = styled.button`
  border: 0;
  background-color: #f8fafc;
  padding: 8px;
  &:hover {
    &:focus-visible {
      ${focusOutline}
    }
  }
`;

const FunctionalNestedLogoButton = styled.button`
  border: 0;
  background-color: #fdf4ff;
  padding: 8px;
  &:is(:hover, :focus) {
    &:active {
      ${focusOutline}
    }
  }
`;

const MultilineBeforeLogoButton = styled.button`
  border: 0;
  background-color: #f0fdfa;
  padding: 8px;
  &:focus-visible {
    outline-color: color-mix(
      in srgb,
      red 50%,
      blue
    );
    ${focusOutline};
  }
`;

const MultilineSelectorListLogoButton = styled.button`
  border: 0;
  background-color: #faf5ff;
  padding: 8px;
  &:hover,
  &:focus-visible {
    ${focusOutline}
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <Thing data-label=" after">Hover me!</Thing>
    <FocusableCell $isAnimating>
      <button type="button">Focusable cell</button>
    </FocusableCell>
    <LogoButton type="button">Logo button</LogoButton>
    <ResponsiveLogoButton type="button">Responsive logo button</ResponsiveLogoButton>
    <MediaLogoButton type="button">Media logo button</MediaLogoButton>
    <CompactLogoButton type="button">Compact logo button</CompactLogoButton>
    <CompactMediaLogoButton type="button">Compact media logo button</CompactMediaLogoButton>
    <OrderedLogoButton type="button">Ordered logo button</OrderedLogoButton>
    <OrderedMediaLogoButton type="button">Ordered media logo button</OrderedMediaLogoButton>
    <NestedLogoButton type="button">Nested logo button</NestedLogoButton>
    <FunctionalNestedLogoButton type="button">
      Functional nested logo button
    </FunctionalNestedLogoButton>
    <MultilineBeforeLogoButton type="button">
      Multiline before logo button
    </MultilineBeforeLogoButton>
    <MultilineSelectorListLogoButton type="button">
      Multiline selector list logo button
    </MultilineSelectorListLogoButton>
  </div>
);
