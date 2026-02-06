import styled from "styled-components";
import { ExternalComponent } from "./lib/external-component";

// This uses styleFnFromProps pattern - prop value is directly used as style value
const StyledExternal = styled(ExternalComponent)<{ $color?: string; $padding?: string }>`
  color: ${(props) => props.$color || "gray"};
  padding: ${(props) => props.$padding || "10px"};
`;

export function App() {
  return (
    <div>
      <StyledExternal $color="blue" $padding="20px" isOpen />
      <StyledExternal isOpen={false} />
    </div>
  );
}
