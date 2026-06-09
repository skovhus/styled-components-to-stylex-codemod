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

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <Thing data-label=" after">Hover me!</Thing>
    <FocusableCell $isAnimating>
      <button type="button">Focusable cell</button>
    </FocusableCell>
    <LogoButton type="button">Logo button</LogoButton>
    <ResponsiveLogoButton type="button">Responsive logo button</ResponsiveLogoButton>
    <MediaLogoButton type="button">Media logo button</MediaLogoButton>
  </div>
);
