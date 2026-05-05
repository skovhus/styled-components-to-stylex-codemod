// Numeric grid-row values must be stringified for StyleX string-valued properties.
import styled from "styled-components";

const ChartCell = styled.div`
  display: grid;
  grid-row: 2;
  background: #dbeafe;
  padding: 8px;

  @media (max-width: 640px) {
    grid-row: unset;
  }
`;

export const App = () => <ChartCell>Chart cell</ChartCell>;
