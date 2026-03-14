import styled from "styled-components";

const Box = styled.div`
  -webkit-appearance: textfield;
  appearance: none;
`;

const Slider = styled.input`
  &::-webkit-slider-thumb {
    width: 10px;
  }
`;

export const App = () => (
  <div>
    <Box />
    <Slider type="range" />
  </div>
);
