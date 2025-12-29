import styled from 'styled-components';

const Container = styled.div`
  width: calc(100% - 40px);
  max-width: calc(1200px - 2rem);
  margin: 0 auto;
  padding: calc(16px + 1vw);
`;

const Sidebar = styled.aside`
  width: calc(25% - 20px);
  min-width: calc(200px + 2vw);
  height: calc(100vh - 60px);
  padding: calc(8px * 2);
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, calc(33.333% - 20px));
  gap: calc(10px + 0.5vw);
`;

const FlexItem = styled.div`
  flex: 0 0 calc(50% - 1rem);
  padding: calc(1rem / 2);
`;

// Nested calc
const ComplexCalc = styled.div`
  width: calc(100% - calc(20px + 2rem));
  margin: calc(10px + calc(5px * 2));
`;

// Calc with CSS variables
const WithVariables = styled.div`
  --base-size: 16px;
  width: calc(var(--base-size) * 10);
  padding: calc(var(--base-size) / 2);
`;

export const App = () => (
  <Container>
    <Grid>
      <FlexItem>Item 1</FlexItem>
      <FlexItem>Item 2</FlexItem>
    </Grid>
    <Sidebar>Sidebar content</Sidebar>
    <ComplexCalc>Complex calc</ComplexCalc>
    <WithVariables>With variables</WithVariables>
  </Container>
);
