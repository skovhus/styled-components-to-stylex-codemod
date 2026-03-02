// @container query with static container name and breakpoint
import styled from "styled-components";

// Show/hide based on container width
const ResponsiveItem = styled.div`
  display: none;

  @container sidebar (min-width: 300px) {
    display: flex;
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
  </Container>
);
