import styled from "styled-components";

const Box = styled.div`
  color: ${(props) => props.theme.color.labelBase ?? "black"};
`;

export const App = () => <Box>Fallback test</Box>;
