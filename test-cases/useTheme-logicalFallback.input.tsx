import styled from "styled-components";

const Box = styled.div`
  color: ${(props) => props.theme.color.labelBase ?? "black"};
  background-color: ${(props) => props.theme.color.bgBase || "white"};
`;

export const App = () => <Box>Fallback test</Box>;
