import styled from "styled-components";

const Box = styled.div`
  padding: 16px;
  box-shadow: ${(props) => `inset 0 0 0 1px ${props.theme.color.bgBorderFaint}`};
  color: ${(props) => props.theme.color.labelBase};
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Box>Template literal with theme</Box>
  </div>
);
