// Custom camelCase prop used in interpolation without explicit type
import styled from "styled-components";

type BoxProps = { active?: boolean };

const Box = styled.div<BoxProps>`
  background-color: ${(props) => (props.active ? "blue" : "gray")};
  padding: 16px;
`;

export const App = () => (
  <div>
    <Box active>Active</Box>
    <Box>Inactive</Box>
  </div>
);
