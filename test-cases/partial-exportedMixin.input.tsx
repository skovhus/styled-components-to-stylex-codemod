import styled, { css } from "styled-components";

export const exportedMixinStyles = css`
  width: 1px;
  border-radius: 0.5px;
  background-color: #94a3b8;
  pointer-events: none;
`;

const Container = styled.div`
  padding: 8px;
  background-color: #f8fafc;
`;

export const App = () => <Container>Exported mixin stays styled-components</Container>;
