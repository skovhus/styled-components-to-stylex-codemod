import styled from "styled-components";

// Block-level theme binary conditional: theme.mode === "dark" controls entire CSS block
const Box = styled.div`
  height: 100px;
  width: 100px;
  ${(props) => (props.theme.mode === "dark" ? "color: white;" : "color: black;")}
`;

export const App = () => <Box>Theme mode</Box>;
