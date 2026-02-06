import styled from "styled-components";

// Block-level theme logical conditional: theme.isDark && props.enabled controls entire CSS block
const Box = styled.div<{ enabled: boolean }>`
  height: 100px;
  width: 100px;
  background: red;
  ${(props) => (props.theme.isDark && props.enabled ? "opacity: 0.5;" : "")}
`;

export const App = () => (
  <>
    <Box enabled={true} />
    <Box enabled={false} />
  </>
);
