// Dynamic prop-based color under pseudo selector triggers inline-style-props wrapValue path
import styled from "styled-components";

const Swatch = styled.div<{ $color: string; $shadow?: string }>`
  width: 60px;
  height: 60px;
  border-radius: 8px;
  background-color: ${(props) => props.$color};
  cursor: pointer;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: ${(props) => `0 0 0 3px ${props.$color}`};
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 12, padding: 16 }}>
      <Swatch $color="#bf4f74">Pink</Swatch>
      <Swatch $color="#4caf50">Green</Swatch>
      <Swatch $color="#2196f3">Blue</Swatch>
    </div>
  );
}
