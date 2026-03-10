// Conditional border helper call inside ternary — must not be silently dropped
import styled from "styled-components";
import { thinBorder } from "./lib/helpers";

const SimpleBox = styled.div<{ $bordered?: boolean }>`
  padding: 8px;
  border: ${(props) => (props.$bordered ? thinBorder("blue") : "none")};
  width: 60px;
  height: 30px;
`;

const EnumBox = styled.div<{ position: "top" | "bottom" | "free" }>`
  padding: 8px;
  border: ${(props) => (props.position !== "free" ? thinBorder("transparent") : "none")};
  ${(props) =>
    props.position === "top"
      ? `border-bottom-width: 0; border-top-left-radius: 6px; border-top-right-radius: 6px;`
      : `border-top-width: 0; border-bottom-left-radius: 6px; border-bottom-right-radius: 6px;`}
  width: 60px;
  height: 30px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: "10px", padding: "10px" }}>
    <SimpleBox $bordered>Bordered</SimpleBox>
    <SimpleBox>Not Bordered</SimpleBox>
    <EnumBox position="top">Top</EnumBox>
    <EnumBox position="bottom">Bottom</EnumBox>
    <EnumBox position="free">Free</EnumBox>
  </div>
);
