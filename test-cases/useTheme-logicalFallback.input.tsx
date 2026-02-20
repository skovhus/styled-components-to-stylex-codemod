import styled from "styled-components";

// Theme value fallback should resolve through adapter theme mappings.
const Box = styled.div`
  color: ${(props) => props.theme.color.labelBase ?? "black"};
`;

export const App = () => <Box>Theme fallback</Box>;
