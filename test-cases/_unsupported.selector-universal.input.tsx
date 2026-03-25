// @expected-warning: Universal selectors (`*`) are currently unsupported
import styled from "styled-components";

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

// Inherited property but with !important — cannot lift safely
const ImportantReset = styled.div`
  & * {
    color: red !important;
  }
`;

// Inherited property but conflicts with base — developer wants different parent vs descendant values
const ConflictingColor = styled.div`
  color: blue;

  & * {
    color: red;
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
    <ImportantReset>
      <span>Important color</span>
    </ImportantReset>
    <ConflictingColor>
      Parent is blue
      <span>Child is red</span>
    </ConflictingColor>
  </div>
);
