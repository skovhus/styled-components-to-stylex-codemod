import styled from "styled-components";

const Button = styled.button<{ $primary?: boolean; hollow?: boolean }>`
  color: ${(props) => (props.$primary ? "white" : "#BF4F74")};
  font-size: 1em;
  margin: 1em;
  padding: 0.25em 1em;
  border-radius: 3px;
  ${(props) =>
    props.hollow
      ? `border: 2px solid #bf4f74`
      : `background: ${props.$primary ? "#BF4F74" : "white"}`};
`;

export const App = () => (
  <div>
    <Button>Normal</Button>
    <Button $primary>Primary</Button>
    <br />
    <Button hollow>Hollow</Button>
    <Button hollow $primary>
      Primary Hollow
    </Button>
  </div>
);
