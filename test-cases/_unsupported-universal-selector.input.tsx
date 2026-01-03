import styled from "styled-components";

// expected-warnings: none
// NOTE: This fixture uses universal selectors (e.g. `& *`, `&:hover *`) which are not
// currently representable in StyleX. It's excluded from Storybook/test pairing by the `_unsupported-` prefix.

// Universal selector for all children
const ResetBox = styled.div`
  & * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
`;

// Universal direct children
const Container = styled.div`
  display: flex;
  gap: 16px;

  & > * {
    flex: 1;
    min-width: 0;
  }
`;

// Universal with pseudo-class
const List = styled.ul`
  list-style: none;
  padding: 0;

  & > *:not(:last-child) {
    margin-bottom: 8px;
  }

  & > *:first-child {
    font-weight: bold;
  }
`;

// Universal in hover state
const HoverContainer = styled.div`
  &:hover * {
    color: #bf4f74;
  }
`;

// Nested universal selectors
const DeepReset = styled.div`
  & * {
    font-family: inherit;
  }

  & * * {
    font-size: inherit;
  }
`;

export const App = () => (
  <div>
    <ResetBox>
      <p>Paragraph</p>
      <span>Span</span>
    </ResetBox>
    <Container>
      <div>Item 1</div>
      <div>Item 2</div>
      <div>Item 3</div>
    </Container>
    <List>
      <li>First (bold)</li>
      <li>Second</li>
      <li>Third</li>
    </List>
    <HoverContainer>
      <span>Hover parent to change color</span>
    </HoverContainer>
    <DeepReset>
      <div>
        <span>Deep nested</span>
      </div>
    </DeepReset>
  </div>
);
