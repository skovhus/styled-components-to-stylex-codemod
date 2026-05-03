import styled from "styled-components";

const Box = styled.div`
  -webkit-appearance: textfield;
  appearance: none;
  width: 120px;
  height: 40px;
  border: 1px solid #555;
  background-color: #eef;
`;

const Slider = styled.input`
  &::-webkit-slider-thumb {
    width: 10px;
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12, padding: 12 }}>
    <Box>Vendor box</Box>
    <Slider type="range" />
  </div>
);
