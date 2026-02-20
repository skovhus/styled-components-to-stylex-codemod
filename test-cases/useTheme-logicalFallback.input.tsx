import styled from "styled-components";

// Theme logical fallback with a static literal should resolve through adapter theme tokens.
const Box = styled.div`
  color: ${(props) => props.theme.color.labelBase ?? "black"};
`;

export const App = () => <Box>Fallback label</Box>;
