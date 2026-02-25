// Ternary on theme.isDark for background, plus data-state selectors with theme interpolations.
import styled from "styled-components";

const Container = styled.div`
  display: flex;
  padding: 1px;
  border-radius: 6px;
  background: ${(props) => (props.theme.isDark ? props.theme.color.bgBase : props.theme.color.bgSub)};
`;

const Tab = styled.button`
  flex: 1;
  min-height: 32px;
  font-size: 14px;
  color: #111;
  border-radius: 5px;
  box-shadow: none;

  &[data-state="inactive"] {
    color: #999;
  }

  &[data-state="active"] {
    background: ${(props) => props.theme.color.bgBase};
    box-shadow: 0 0 0 1px ${(props) => props.theme.color.bgBorderFaint},
      0 1px 2px rgba(0, 0, 0, 0.1);
  }
`;

export const App = () => (
  <Container>
    <Tab data-state="active">Active Tab</Tab>
    <Tab data-state="inactive">Inactive Tab</Tab>
    <Tab data-state="active">Another Active</Tab>
  </Container>
);
