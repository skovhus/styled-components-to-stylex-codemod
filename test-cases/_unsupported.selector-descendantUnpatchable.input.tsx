// @expected-warning: Unsupported selector: component selector target has no patchable JSX usage under selector parent
import styled from "styled-components";

const Icon = styled.span`
  display: inline-block;
  width: 16px;
  height: 16px;
`;

const Container = styled.div`
  padding: 12px;

  ${Icon} {
    color: red;
  }
`;

export const App = () => (
  <div>
    <Icon />
    <Container>
      <span>No patchable icon here</span>
    </Container>
  </div>
);
