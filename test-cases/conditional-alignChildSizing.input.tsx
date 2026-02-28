// Conditional alignment logic with child sizing based on prop values
import styled from "styled-components";

type Align = "top" | "center" | "bottom";

const Container = styled.div<{ align: Align; $property?: "width" | "height" }>`
  overflow: hidden;
  background: #f0f0f0;
  ${(props) =>
    props.align !== "top"
      ? `display: flex;
         align-items: ${props.align === "center" ? "center" : "flex-end"};`
      : ""}
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px" }}>
    <Container align="top" style={{ height: "100px", width: "80px" }}>
      <div style={{ background: "#bf4f74", padding: "8px", color: "white" }}>Top</div>
    </Container>
    <Container align="center" style={{ height: "100px", width: "80px" }}>
      <div style={{ background: "#4f74bf", padding: "8px", color: "white" }}>Center</div>
    </Container>
    <Container align="bottom" style={{ height: "100px", width: "80px" }}>
      <div style={{ background: "#22c55e", padding: "8px", color: "white" }}>Bottom</div>
    </Container>
  </div>
);
