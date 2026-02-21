import styled from "styled-components";

const Box = styled.div`
  color: ${(props) => props.theme.color.labelBase ?? "black"};
  background-color: ${(props) => props.theme.color.bgBase || "white"};
  box-shadow: 0px 2px 4px ${(props) => props.theme.color.labelBase ?? "gray"};
`;

export const App = () => <Box>Fallback test</Box>;
