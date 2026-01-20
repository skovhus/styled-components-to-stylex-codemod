import styled from "styled-components";

const Slider = styled.input`
  &::-webkit-slider-thumb {
    width: 10px;
  }
`;

export const App = () => <Slider type="range" />;
