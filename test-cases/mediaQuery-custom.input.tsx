import styled from "styled-components";

export const ConditionalContainer = styled.div<{ $size: number }>`
  @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
    font-size: ${(props) => props.$size - 5}px;
  }
`;

export const App = () => <ConditionalContainer $size={16}>Hello</ConditionalContainer>;
