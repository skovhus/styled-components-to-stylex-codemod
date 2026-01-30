import styled from "styled-components";

const color1 = "#ff0000";
const color2 = "#0000ff";

const GradientBox = styled.div`
  background: linear-gradient(${color1}, ${color2});
  width: 200px;
  height: 100px;
`;

export const App = () => <GradientBox>Gradient</GradientBox>;
