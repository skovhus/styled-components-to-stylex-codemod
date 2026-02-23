import styled from "styled-components";

/** A container that scales based on a dynamic size prop */
const SizeBox = styled.div<{ $size: number }>`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  width: ${(props) => props.$size}px;
  max-width: ${(props) => props.$size}px;
  max-height: ${(props) => props.$size}px;
  background-color: cornflowerblue;
  padding: 8px;
  color: white;
`;

export { SizeBox };

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16, alignItems: "center" }}>
    <SizeBox $size={60}>60</SizeBox>
    <SizeBox $size={100}>100</SizeBox>
    <SizeBox $size={140}>140</SizeBox>
  </div>
);
