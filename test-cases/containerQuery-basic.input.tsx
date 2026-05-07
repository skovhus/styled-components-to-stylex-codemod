// @container query with static container name and breakpoint
import styled from "styled-components";
import { flexCenter } from "./lib/helpers";

// Show/hide based on container width
const ResponsiveItem = styled.div`
  display: none;

  @container sidebar (min-width: 300px) {
    display: flex;
  }
`;

const WrappingRow = styled.div`
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;

  @container sidebar (max-width: 240px) {
    flex-wrap: wrap;
  }
`;

const WrappingRowAfterHelper = styled.div`
  display: flex;
  ${flexCenter()}
  flex-wrap: nowrap;
  gap: 8px;

  @container sidebar (max-width: 240px) {
    flex-wrap: wrap;
  }
`;

// Container context
const Container = styled.div`
  container-name: sidebar;
  container-type: inline-size;
  width: 100%;
  border: 1px solid #ccc;
  padding: 16px;
`;

export const App = () => (
  <Container>
    <ResponsiveItem>Visible when container &gt; 300px</ResponsiveItem>
    <WrappingRow>
      <span>Container</span>
      <span>wraps</span>
    </WrappingRow>
    <WrappingRowAfterHelper>
      <span>Helper</span>
      <span>wraps</span>
    </WrappingRowAfterHelper>
  </Container>
);
