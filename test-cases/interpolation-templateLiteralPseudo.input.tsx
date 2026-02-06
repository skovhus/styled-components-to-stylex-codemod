import styled from "styled-components";

/**
 * Template literal interpolation inside pseudo/media should stay scoped
 * when preserved via a StyleX style function.
 */
const HoverSwatch = styled.div<{ $tone: string }>`
  display: inline-block;

  &:hover {
    color: ${(props) => `var(--tone, ${props.$tone})`};
  }
`;

const HoverMediaSwatch = styled.div<{ $tone: string }>`
  display: inline-block;

  &:hover {
    @media (hover: hover) {
      color: ${(props) => `var(--tone, ${props.$tone})`};
    }
  }
`;

export const App = () => (
  <div>
    <HoverSwatch $tone="tomato">Hover</HoverSwatch>
    <HoverMediaSwatch $tone="plum">Hover Media</HoverMediaSwatch>
  </div>
);
