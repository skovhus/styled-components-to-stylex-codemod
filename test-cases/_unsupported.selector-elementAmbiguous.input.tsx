// @expected-warning: Unsupported selector: ambiguous element selector
import styled from "styled-components";

const SmallIcon = styled.svg`
  fill: gray;
  width: 16px;
`;

const LargeIcon = styled.svg`
  fill: gray;
  width: 32px;
`;

const Container = styled.div`
  padding: 16px;

  svg {
    fill: blue;
  }
`;

export const App = () => (
  <Container>
    <SmallIcon viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" />
    </SmallIcon>
    <LargeIcon viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" />
    </LargeIcon>
  </Container>
);
