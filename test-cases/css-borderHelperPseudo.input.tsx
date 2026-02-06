import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

export const StyledHeader = styled.header`
  display: flex;
  padding: 16px;
  background: #f0f0f0;
  &:not(:only-child) {
    border-bottom: ${thinPixel()} solid var(--settings-list-view-border-color);
  }
`;

const Container = styled.div`
  --settings-list-view-border-color: #bf4f74;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const App = () => (
  <Container>
    <StyledHeader>Header 1 (has border because not only child)</StyledHeader>
    <StyledHeader>Header 2 (has border because not only child)</StyledHeader>
    <div style={{ padding: 16, background: "#e0e0e0" }}>
      <StyledHeader>Header 3 (no border - only child of this div)</StyledHeader>
    </div>
  </Container>
);
